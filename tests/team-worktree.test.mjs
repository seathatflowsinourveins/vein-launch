/**
 * TDD tests for isolation field propagation in src/team.mjs.
 * Verifies that `agents.isolation` from .vein.json flows into the generated team config.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/mock/home"),
}));

const { generateTeamConfig } = await import("../src/team.mjs");

const BASE_CONFIG = {
  agents: {
    teamName: "isolation-team",
    lead: { model: "opus", instructions: "Coordinate" },
    teammates: [{ name: "worker-a", model: "sonnet", instructions: "Implement" }],
  },
};

describe("generateTeamConfig — isolation field", () => {
  it("includes isolation field when agents.isolation is set to worktree", () => {
    const config = {
      agents: { ...BASE_CONFIG.agents, isolation: "worktree" },
    };
    const result = generateTeamConfig(config);
    expect(result).not.toBeNull();
    expect(result.isolation).toBe("worktree");
  });

  it("does NOT include isolation field when agents.isolation is absent", () => {
    const result = generateTeamConfig(BASE_CONFIG);
    expect(result).not.toBeNull();
    expect(result.isolation).toBeUndefined();
  });

  it("passes isolation value through without modification", () => {
    const config = {
      agents: { ...BASE_CONFIG.agents, isolation: "container" },
    };
    const result = generateTeamConfig(config);
    expect(result.isolation).toBe("container");
  });

  it("teammate-level isolation is preserved when present in teammates array", () => {
    const config = {
      agents: {
        ...BASE_CONFIG.agents,
        teammates: [
          { name: "w1", model: "sonnet", instructions: "Work", isolation: "worktree" },
          { name: "w2", model: "haiku", instructions: "Review" },
        ],
      },
    };
    const result = generateTeamConfig(config);
    expect(result.teammates[0].isolation).toBe("worktree");
    expect(result.teammates[1].isolation).toBeUndefined();
  });

  it("team-level and teammate-level isolation can coexist", () => {
    const config = {
      agents: {
        ...BASE_CONFIG.agents,
        isolation: "worktree",
        teammates: [{ name: "w1", model: "sonnet", instructions: "Work", isolation: "worktree" }],
      },
    };
    const result = generateTeamConfig(config);
    expect(result.isolation).toBe("worktree");
    expect(result.teammates[0].isolation).toBe("worktree");
  });

  it("returns null when no teamName even with isolation set", () => {
    const config = {
      agents: { isolation: "worktree", teammates: [] },
    };
    expect(generateTeamConfig(config)).toBeNull();
  });
});
