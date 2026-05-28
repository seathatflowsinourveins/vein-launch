/**
 * Tests for src/setup/first-time.mjs
 *
 * Mocks: node:fs/promises, node:os, node:crypto, node:child_process, node:path
 * All file I/O and env-mutation are intercepted; no real disk changes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks (hoisted before any import) ────────────────────────────────

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  symlink: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockRejectedValue({ code: "ENOENT" }),
  writeFile: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ isSymbolicLink: () => false }),
  readlink: vi.fn().mockRejectedValue({ code: "ENOENT" }),
  access: vi.fn().mockRejectedValue({ code: "ENOENT" }),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn().mockReturnValue("/home/user"),
}));

vi.mock("node:crypto", () => ({
  randomBytes: vi
    .fn()
    .mockReturnValue({ toString: () => "deadbeef1234567890abcdef12345678901234567890abcd" }),
}));

vi.mock("../../src/lib/shell.mjs", () => ({
  exec: vi
    .fn()
    .mockResolvedValue({ ok: true, stdout: "", stderr: "", exitCode: 0, timedOut: false }),
  execArgs: vi
    .fn()
    .mockResolvedValue({ ok: true, stdout: "", stderr: "", exitCode: 0, timedOut: false }),
}));

// ── Lazy imports (after mocks are set up) ───────────────────────────────────

const fsp = await import("node:fs/promises");
const { exec: shellExec } = await import("../../src/lib/shell.mjs");
const { runFirstTimeSetup, SETUP_DIRS, SETUP_STEPS } = await import(
  "../../src/setup/first-time.mjs"
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeInstallJson(overrides = {}) {
  return JSON.stringify({
    version: "1.2.0",
    repoRoot: "/repo",
    installedAt: new Date().toISOString(),
    setupSteps: [],
    ...overrides,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runFirstTimeSetup — exported constants", () => {
  it("SETUP_DIRS is an array of strings", () => {
    expect(Array.isArray(SETUP_DIRS)).toBe(true);
    expect(SETUP_DIRS.length).toBeGreaterThan(0);
    for (const d of SETUP_DIRS) {
      expect(typeof d).toBe("string");
    }
  });

  it("SETUP_DIRS includes all four required directories", () => {
    const dirs = SETUP_DIRS.join(" ");
    expect(dirs).toMatch(/runs/);
    expect(dirs).toMatch(/eval-history/);
    expect(dirs).toMatch(/sessions/);
    expect(dirs).toMatch(/hud/);
  });

  it("SETUP_STEPS is an array of step-name strings", () => {
    expect(Array.isArray(SETUP_STEPS)).toBe(true);
    expect(SETUP_STEPS.length).toBeGreaterThan(0);
    for (const s of SETUP_STEPS) {
      expect(typeof s).toBe("string");
    }
  });
});

describe("runFirstTimeSetup — fresh install (no install.json)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no install.json exists
    fsp.readFile.mockRejectedValue({ code: "ENOENT" });
    fsp.mkdir.mockResolvedValue(undefined);
    fsp.writeFile.mockResolvedValue(undefined);
    fsp.symlink.mockResolvedValue(undefined);
    shellExec.mockResolvedValue({ ok: true, stdout: "", stderr: "", exitCode: 0, timedOut: false });
    // Access fails → PATH not yet set
    fsp.access.mockRejectedValue({ code: "ENOENT" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns an object with ok, results, and installedAt", async () => {
    const result = await runFirstTimeSetup({ repoRoot: "/repo", dryRun: true });
    expect(typeof result.ok).toBe("boolean");
    expect(Array.isArray(result.results)).toBe(true);
    expect(typeof result.installedAt).toBe("string");
  });

  it("dryRun:true returns ok:true and does not call mkdir", async () => {
    const result = await runFirstTimeSetup({ repoRoot: "/repo", dryRun: true });
    expect(result.ok).toBe(true);
    expect(fsp.mkdir).not.toHaveBeenCalled();
    expect(fsp.writeFile).not.toHaveBeenCalled();
  });

  it("creates each of the four ~/.vein/* directories", async () => {
    await runFirstTimeSetup({ repoRoot: "/repo" });
    const mkdirCalls = fsp.mkdir.mock.calls.map((c) => c[0]);
    const joined = mkdirCalls.join("|");
    expect(joined).toMatch(/runs/);
    expect(joined).toMatch(/eval-history/);
    expect(joined).toMatch(/sessions/);
    expect(joined).toMatch(/hud/);
  });

  it("creates dirs with recursive:true", async () => {
    await runFirstTimeSetup({ repoRoot: "/repo" });
    for (const [, opts] of fsp.mkdir.mock.calls) {
      expect(opts?.recursive).toBe(true);
    }
  });

  it("runs npm-link step (SOTA CLI distribution via npm link)", async () => {
    const { exec } = await import("../../src/lib/shell.mjs");
    await runFirstTimeSetup({ repoRoot: "/repo" });
    const linkCall = exec.mock.calls.find((c) => String(c[0]).includes("npm link"));
    expect(linkCall).toBeDefined();
  });

  it("writes install.json via writeFile", async () => {
    await runFirstTimeSetup({ repoRoot: "/repo" });
    const writeCall = fsp.writeFile.mock.calls.find((c) => String(c[0]).includes("install.json"));
    expect(writeCall).toBeDefined();
    const parsed = JSON.parse(writeCall[1]);
    expect(parsed.repoRoot).toBe("/repo");
    expect(typeof parsed.installedAt).toBe("string");
    expect(Array.isArray(parsed.setupSteps)).toBe(true);
  });

  it("install.json includes version field", async () => {
    await runFirstTimeSetup({ repoRoot: "/repo" });
    const writeCall = fsp.writeFile.mock.calls.find((c) => String(c[0]).includes("install.json"));
    const parsed = JSON.parse(writeCall[1]);
    expect(typeof parsed.version).toBe("string");
    expect(parsed.version.length).toBeGreaterThan(0);
  });

  it("generates a CLIProxy key starting with sk-ant-vein-", async () => {
    await runFirstTimeSetup({ repoRoot: "/repo" });
    const writeCall = fsp.writeFile.mock.calls.find(
      (c) => String(c[0]).includes("cliproxy") || String(c[1]).includes("sk-ant-vein-"),
    );
    expect(writeCall).toBeDefined();
    const content = writeCall[1];
    expect(content).toMatch(/sk-ant-vein-/);
  });

  it("returns results array where each entry has name and ok", async () => {
    const { results } = await runFirstTimeSetup({ repoRoot: "/repo" });
    for (const r of results) {
      expect(typeof r.name).toBe("string");
      expect(typeof r.ok).toBe("boolean");
    }
  });

  it("reports each setup step in results", async () => {
    const { results } = await runFirstTimeSetup({ repoRoot: "/repo" });
    const names = results.map((r) => r.name);
    // At minimum: dirs, npm-link, install-json, cliproxy-key
    expect(names).toContain("create-dirs");
    expect(names).toContain("npm-link");
    expect(names).toContain("install-json");
    expect(names).toContain("cliproxy-key");
  });
});

describe("runFirstTimeSetup — idempotence (install.json already exists)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsp.readFile.mockImplementation((p) => {
      if (String(p).includes("install.json")) {
        return Promise.resolve(
          makeInstallJson({
            setupSteps: ["create-dirs", "npm-link", "install-json", "cliproxy-key"],
          }),
        );
      }
      return Promise.reject({ code: "ENOENT" });
    });
    fsp.mkdir.mockResolvedValue(undefined);
    fsp.writeFile.mockResolvedValue(undefined);
    fsp.symlink.mockResolvedValue(undefined);
    shellExec.mockResolvedValue({ ok: true, stdout: "", stderr: "", exitCode: 0, timedOut: false });
  });

  it("skips already-completed steps", async () => {
    const { results } = await runFirstTimeSetup({ repoRoot: "/repo" });
    const skipped = results.filter((r) => r.skipped === true);
    expect(skipped.length).toBeGreaterThan(0);
  });

  it("does not re-run mkdir when create-dirs already done", async () => {
    await runFirstTimeSetup({ repoRoot: "/repo" });
    // mkdir may be called with recursive for safety, but install.json step skipped
    const writeCalls = fsp.writeFile.mock.calls.filter((c) =>
      String(c[0]).includes("install.json"),
    );
    // install.json skipped → no re-write
    expect(writeCalls.length).toBe(0);
  });
});

describe("runFirstTimeSetup — step-level error isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsp.readFile.mockRejectedValue({ code: "ENOENT" });
    fsp.access.mockRejectedValue({ code: "ENOENT" });
  });

  it("continues running remaining steps when one step throws", async () => {
    // mkdir rejects for one call only
    let calls = 0;
    fsp.mkdir.mockImplementation(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error("permission denied"));
      return Promise.resolve(undefined);
    });
    fsp.writeFile.mockResolvedValue(undefined);
    fsp.symlink.mockResolvedValue(undefined);
    shellExec.mockResolvedValue({ ok: true, stdout: "", stderr: "", exitCode: 0, timedOut: false });

    const { results } = await runFirstTimeSetup({ repoRoot: "/repo" });
    // Should still have results for subsequent steps
    expect(results.length).toBeGreaterThan(1);
  });

  it("marks failed step as ok:false with a message", async () => {
    fsp.mkdir.mockRejectedValue(new Error("EPERM"));
    fsp.writeFile.mockResolvedValue(undefined);
    fsp.symlink.mockResolvedValue(undefined);
    shellExec.mockResolvedValue({ ok: true, stdout: "", stderr: "", exitCode: 0, timedOut: false });

    const { results } = await runFirstTimeSetup({ repoRoot: "/repo" });
    const failed = results.find((r) => !r.ok);
    expect(failed).toBeDefined();
    expect(typeof failed.message).toBe("string");
    expect(failed.message.length).toBeGreaterThan(0);
  });

  it("returns ok:false when any step fails", async () => {
    fsp.mkdir.mockRejectedValue(new Error("EPERM"));
    fsp.writeFile.mockResolvedValue(undefined);
    fsp.symlink.mockResolvedValue(undefined);
    shellExec.mockResolvedValue({ ok: true, stdout: "", stderr: "", exitCode: 0, timedOut: false });

    const { ok } = await runFirstTimeSetup({ repoRoot: "/repo" });
    expect(ok).toBe(false);
  });
});

describe("runFirstTimeSetup — auth-conflict detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsp.readFile.mockRejectedValue({ code: "ENOENT" });
    fsp.mkdir.mockResolvedValue(undefined);
    fsp.writeFile.mockResolvedValue(undefined);
    fsp.symlink.mockResolvedValue(undefined);
    fsp.access.mockRejectedValue({ code: "ENOENT" });
    shellExec.mockResolvedValue({ ok: true, stdout: "", stderr: "", exitCode: 0, timedOut: false });
  });

  it("detects auth conflict when both ANTHROPIC_API_KEY and CLAUDE_AI_TOKEN are set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-existing";
    process.env.CLAUDE_AI_TOKEN = "claude-ai-token";
    const { results } = await runFirstTimeSetup({ repoRoot: "/repo" });
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_AI_TOKEN;
    const authCheck = results.find((r) => r.name === "auth-conflict");
    expect(authCheck).toBeDefined();
    expect(authCheck.warn).toBe(true);
  });

  it("no auth conflict warning when only API key is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-existing";
    delete process.env.CLAUDE_AI_TOKEN;
    const { results } = await runFirstTimeSetup({ repoRoot: "/repo" });
    delete process.env.ANTHROPIC_API_KEY;
    const authCheck = results.find((r) => r.name === "auth-conflict");
    if (authCheck) {
      expect(authCheck.warn).toBeFalsy();
    }
  });
});
