/**
 * Integration tests for orchestrate() — verifies the end-to-end mode routing,
 * config validation, and launch behaviour without spawning a real process.
 *
 * All I/O side-effects are mocked: launchClaude (exec), persistResults, and
 * runTiers (runner) so tests do not depend on rtk/tooling being installed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all dependencies BEFORE importing orchestrate
vi.mock("../src/lib/exec.mjs", () => ({
  launchClaude: vi.fn(),
}));

vi.mock("../src/lib/persist.mjs", () => ({
  persistResults: vi.fn().mockResolvedValue({}),
}));

vi.mock("../src/lib/runner.mjs", () => ({
  runTiers: vi.fn().mockResolvedValue({
    results: [],
    budgetExceeded: false,
    elapsed: 0,
  }),
}));

import { launchClaude } from "../src/lib/exec.mjs";
import { orchestrate } from "../src/orchestrator.mjs";

describe("orchestrate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns SUCCESS (0) for fast mode with no project", async () => {
    const code = await orchestrate(["--mode=fast"]);
    expect(code).toBe(0);
  });

  it("returns CONFIG_INVALID (3) for conflicting flags", async () => {
    const code = await orchestrate(["--deep", "--repair"]);
    expect(code).toBe(3);
  });

  it("returns CONFIG_INVALID (3) for --deep without project", async () => {
    const code = await orchestrate(["--deep"]);
    expect(code).toBe(3);
  });

  it("calls launchClaude after successful tiers when not CI", async () => {
    const code = await orchestrate(["--mode=fast"]);
    expect(code).toBe(0);
    // launchClaude is called when projectDir exists and not CI
    // With no project specified, projectDir = cwd, so launch IS called
    expect(launchClaude).toHaveBeenCalled();
  });

  it("does NOT call launchClaude in CI mode", async () => {
    const code = await orchestrate(["--ci", "--mode=fast"]);
    expect(code).toBe(0);
    expect(launchClaude).not.toHaveBeenCalled();
  });

  it("returns SUCCESS for --status command", async () => {
    const code = await orchestrate(["--status"]);
    expect(code).toBe(0);
  });
});
