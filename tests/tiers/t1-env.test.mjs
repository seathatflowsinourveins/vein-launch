import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Severity } from "../../src/lib/result.mjs";

// Mock node:fs
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock node:os
vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/mock/home"),
}));

const fs = await import("node:fs");
const { check, repair, meta } = await import("../../src/tiers/t1-env.mjs");

const mockConfig = { projectDir: "/mock/project" };
const fastContext = { mode: "fast" };
const deepContext = { mode: "deep" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  // Default: all env vars set, state dir exists
  vi.stubEnv("ANTHROPIC_BASE_URL", "http://localhost:8317");
  vi.stubEnv("ENABLE_TOOL_SEARCH", "true");
  fs.existsSync.mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("meta", () => {
  it("has correct id and name", () => {
    expect(meta.id).toBe("t1-env");
    expect(meta.name).toBe("ENV");
    expect(meta.modes).toContain("fast");
    expect(meta.modes).toContain("deep");
    expect(meta.modes).toContain("repair");
  });
});

describe("check — fast mode", () => {
  it("PASSes when all env vars are set and state-dir exists", async () => {
    fs.existsSync.mockReturnValue(true);
    const result = await check(mockConfig, fastContext);
    expect(result.severity).toBe(Severity.PASS);
  });

  it("returns INFO when ANTHROPIC_BASE_URL is not set", async () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "");
    const result = await check(mockConfig, fastContext);
    expect(result.severity).toBe(Severity.INFO);
    const baseUrlEvidence = result.evidence.find((e) => e.check === "ANTHROPIC_BASE_URL");
    expect(baseUrlEvidence).toBeDefined();
  });

  it("returns INFO when ENABLE_TOOL_SEARCH is not set to true", async () => {
    vi.stubEnv("ENABLE_TOOL_SEARCH", "");
    const result = await check(mockConfig, fastContext);
    expect(result.severity).toBe(Severity.INFO);
    const toolSearchEvidence = result.evidence.find((e) => e.check === "ENABLE_TOOL_SEARCH");
    expect(toolSearchEvidence).toBeDefined();
  });

  it("returns WARN when state-dir ~/.vein/ does not exist", async () => {
    fs.existsSync.mockReturnValue(false);
    const result = await check(mockConfig, fastContext);
    expect(result.severity).toBe(Severity.WARN);
    const stateDirEvidence = result.evidence.find((e) => e.check === "state-dir");
    expect(stateDirEvidence).toBeDefined();
    expect(stateDirEvidence.remediation).toBeDefined();
  });

  it("checks the correct state-dir path (~/.vein)", async () => {
    // existsSync returns false only for the .vein path (OS-agnostic suffix check)
    fs.existsSync.mockImplementation((p) => !String(p).endsWith(".vein"));
    const result = await check(mockConfig, fastContext);
    expect(result.severity).toBe(Severity.WARN);
  });

  it("all results are frozen (Object.isFrozen)", async () => {
    const result = await check(mockConfig, fastContext);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.evidence)).toBe(true);
  });

  it("durationMs is always a non-negative number", async () => {
    const result = await check(mockConfig, fastContext);
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("check — deep mode", () => {
  it("WARNs when .gitignore doesn't cover .vein/", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue("node_modules/\n.env\n");
    const result = await check(mockConfig, deepContext);
    expect(result.severity).toBe(Severity.WARN);
    const gitignoreEvidence = result.evidence.find((e) => e.check === ".gitignore-coverage");
    expect(gitignoreEvidence).toBeDefined();
    expect(gitignoreEvidence.remediation).toBeDefined();
  });

  it("PASSes when .gitignore includes .vein/", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue("node_modules/\n.vein/\n.env\n");
    const result = await check(mockConfig, deepContext);
    expect(result.severity).toBe(Severity.PASS);
  });

  it("WARNs when ANTHROPIC_BASE_URL is set but has invalid URL format", async () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "not-a-valid-url");
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(".vein/\n");
    const result = await check(mockConfig, deepContext);
    expect(result.severity).toBe(Severity.WARN);
    const urlEvidence = result.evidence.find((e) => e.check === "ANTHROPIC_BASE_URL-format");
    expect(urlEvidence).toBeDefined();
    expect(urlEvidence.remediation).toBeDefined();
  });

  it("deep mode results are also frozen", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(".vein/\n");
    const result = await check(mockConfig, deepContext);
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe("repair", () => {
  it("creates ~/.vein/ when missing", async () => {
    fs.existsSync.mockReturnValue(false);
    fs.readdirSync.mockReturnValue([]);
    await repair(mockConfig, fastContext);
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining(".vein"),
      expect.objectContaining({ recursive: true }),
    );
  });

  it("prunes stale files older than 7 days", async () => {
    const now = Date.now();
    const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
    const oneDayMs = 1 * 24 * 60 * 60 * 1000;

    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(["stale.json", "fresh.json"]);
    fs.statSync.mockImplementation((p) => {
      if (String(p).includes("stale")) return { isFile: () => true, mtimeMs: now - eightDaysMs };
      return { isFile: () => true, mtimeMs: now - oneDayMs };
    });

    await repair(mockConfig, fastContext);

    expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
    expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining("stale.json"));
  });

  it("returns PASS when repair is successful", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue([]);
    const result = await repair(mockConfig, fastContext);
    expect(result.severity).toBe(Severity.PASS);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("repair durationMs is non-negative", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue([]);
    const result = await repair(mockConfig, fastContext);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns BLOCK when mkdirSync throws EACCES", async () => {
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });
    const result = await repair(mockConfig, fastContext);
    expect(result.severity).toBe(Severity.BLOCK);
    expect(result.evidence[0].remediation).toBeTruthy();
  });

  it("returns WARN when readdirSync throws", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockImplementation(() => {
      throw new Error("EPERM: operation not permitted");
    });
    const result = await repair(mockConfig, fastContext);
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence[0].remediation).toBeTruthy();
  });

  it("reports errors but still returns WARN when unlinkSync fails on stale file", async () => {
    const now = Date.now();
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000);
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(["stale.json"]);
    fs.statSync.mockReturnValue({ isFile: () => true, mtimeMs: eightDaysAgo.getTime() });
    fs.unlinkSync.mockImplementation(() => {
      throw new Error("EPERM");
    });
    const result = await repair(mockConfig, fastContext);
    expect(result.severity).toBe(Severity.WARN);
    expect(result.evidence[0].actual).toContain("error");
  });

  it("skips entries with path traversal characters", async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(["../etc/passwd", "normal.json"]);
    fs.statSync.mockReturnValue({ isFile: () => true, mtimeMs: 0 });
    await repair(mockConfig, fastContext);
    expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
    expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining("normal.json"));
  });

  it("only prunes files, not directories", async () => {
    const now = Date.now();
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000);
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(["subdir"]);
    fs.statSync.mockReturnValue({ isFile: () => false, mtimeMs: eightDaysAgo.getTime() });
    await repair(mockConfig, fastContext);
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });
});
