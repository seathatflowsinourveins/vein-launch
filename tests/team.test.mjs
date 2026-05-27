/**
 * TDD tests for src/team.mjs
 * Covers: generateTeamConfig, writeTeamConfig, loadTeamConfig
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/mock/home"),
}));

const fs = await import("node:fs");
const nodePath = await import("node:path");
const { generateTeamConfig, writeTeamConfig, loadTeamConfig } = await import("../src/team.mjs");

const VALID_CONFIG = {
  agents: {
    teamName: "trading-team",
    lead: { model: "opus", instructions: "Coordinate the team" },
    teammates: [
      { name: "researcher", model: "sonnet", instructions: "Research and explore" },
      { name: "implementer", model: "sonnet", instructions: "Write code" },
      { name: "reviewer", model: "haiku", instructions: "Review changes" },
    ],
  },
};

// Use node:path.join so expected paths match the platform separator used by src/team.mjs
const EXPECTED_TASK_DIR = nodePath.join("/mock/home", ".claude", "teams", "trading-team", "tasks");
const EXPECTED_CONFIG_PATH = nodePath.join(
  "/mock/home",
  ".claude",
  "teams",
  "trading-team",
  "config.json",
);

describe("generateTeamConfig", () => {
  it("returns null when no agents config", () => {
    expect(generateTeamConfig({})).toBeNull();
  });

  it("returns null when teamName missing", () => {
    expect(
      generateTeamConfig({ agents: { lead: { model: "opus", instructions: "x" } } }),
    ).toBeNull();
  });

  it("generates correct config from valid input", () => {
    const result = generateTeamConfig(VALID_CONFIG);
    expect(result).not.toBeNull();
    expect(result.name).toBe("trading-team");
    expect(result.lead).toEqual(VALID_CONFIG.agents.lead);
    expect(result.teammates).toEqual(VALID_CONFIG.agents.teammates);
  });

  it("includes taskDir path", () => {
    const result = generateTeamConfig(VALID_CONFIG);
    expect(result.taskDir).toBe(EXPECTED_TASK_DIR);
  });

  it("uses default lead when not specified", () => {
    const config = { agents: { teamName: "my-team", teammates: [] } };
    const result = generateTeamConfig(config);
    expect(result.lead).toEqual({ model: "opus", instructions: "Coordinate the team" });
  });

  it("handles empty teammates array", () => {
    const config = { agents: { teamName: "solo-team", teammates: [] } };
    const result = generateTeamConfig(config);
    expect(result.teammates).toEqual([]);
  });

  it("includes createdAt as ISO string", () => {
    const result = generateTeamConfig(VALID_CONFIG);
    expect(typeof result.createdAt).toBe("string");
    expect(() => new Date(result.createdAt)).not.toThrow();
  });
});

describe("writeTeamConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes config.json to correct path", () => {
    const teamConfig = generateTeamConfig(VALID_CONFIG);
    writeTeamConfig(teamConfig);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      EXPECTED_CONFIG_PATH,
      expect.stringContaining('"trading-team"'),
    );
  });

  it("creates task directory recursively", () => {
    const teamConfig = generateTeamConfig(VALID_CONFIG);
    writeTeamConfig(teamConfig);
    expect(fs.mkdirSync).toHaveBeenCalledWith(EXPECTED_TASK_DIR, { recursive: true });
  });

  it("returns ok:false on invalid config (null)", () => {
    const result = writeTeamConfig(null);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/invalid/i);
  });

  it("returns ok:false on invalid config (missing name)", () => {
    const result = writeTeamConfig({ taskDir: "/some/dir" });
    expect(result.ok).toBe(false);
  });

  it("returns ok:true and message on success", () => {
    const teamConfig = generateTeamConfig(VALID_CONFIG);
    const result = writeTeamConfig(teamConfig);
    expect(result.ok).toBe(true);
    expect(result.message).toContain(EXPECTED_CONFIG_PATH);
  });

  it("returns ok:false when write fails", () => {
    fs.writeFileSync.mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    const teamConfig = generateTeamConfig(VALID_CONFIG);
    const result = writeTeamConfig(teamConfig);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/disk full/);
  });
});

describe("loadTeamConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed config when file exists", () => {
    const stored = { name: "trading-team", teammates: [], taskDir: EXPECTED_TASK_DIR };
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(stored));
    const result = loadTeamConfig("trading-team");
    expect(result).toEqual(stored);
  });

  it("returns null when file doesn't exist", () => {
    fs.existsSync.mockReturnValue(false);
    expect(loadTeamConfig("missing-team")).toBeNull();
  });

  it("returns null on parse error", () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue("not-valid-json{{{");
    expect(loadTeamConfig("bad-team")).toBeNull();
  });

  it("loads config from correct path", () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ name: "trading-team" }));
    loadTeamConfig("trading-team");
    expect(fs.existsSync).toHaveBeenCalledWith(EXPECTED_CONFIG_PATH);
    expect(fs.readFileSync).toHaveBeenCalledWith(EXPECTED_CONFIG_PATH, "utf-8");
  });
});
