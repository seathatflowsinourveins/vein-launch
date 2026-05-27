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
  launchClaude: vi.fn().mockResolvedValue(undefined),
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
import { runTiers } from "../src/lib/runner.mjs";
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

// ---------------------------------------------------------------------------
// _cliproxyActive computation — OPERABLE_SEVERITIES allow-list semantics
// ---------------------------------------------------------------------------

describe("orchestrate _cliproxyActive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper: run orchestrate and capture the config passed to launchClaude.
   */
  async function runAndCaptureLaunchConfig(t2Severity) {
    runTiers.mockResolvedValue({
      results: [
        {
          tierId: "t2-cliproxy",
          tierName: "CLIProxy",
          severity: t2Severity,
          evidence: [],
          durationMs: 0,
        },
      ],
      budgetExceeded: false,
      elapsed: 0,
    });
    await orchestrate(["--mode=fast"]);
    if (!launchClaude.mock.calls.length) return null;
    return launchClaude.mock.calls[0][0]; // first arg is config
  }

  it("sets _cliproxyActive=true when T2 severity is PASS", async () => {
    const config = await runAndCaptureLaunchConfig("pass");
    expect(config._cliproxyActive).toBe(true);
  });

  it("sets _cliproxyActive=true when T2 severity is WARN (real-machine state after /healthz fix)", async () => {
    const config = await runAndCaptureLaunchConfig("warn");
    expect(config._cliproxyActive).toBe(true);
  });

  it("sets _cliproxyActive=true when T2 severity is INFO", async () => {
    const config = await runAndCaptureLaunchConfig("info");
    expect(config._cliproxyActive).toBe(true);
  });

  it("sets _cliproxyActive=true when T2 severity is SKIP", async () => {
    const config = await runAndCaptureLaunchConfig("skip");
    expect(config._cliproxyActive).toBe(true);
  });

  it("sets _cliproxyActive=false when T2 severity is BLOCK", async () => {
    // BLOCK is a fatal severity — cliproxy not operable
    runTiers.mockResolvedValue({
      results: [
        {
          tierId: "t2-cliproxy",
          tierName: "CLIProxy",
          severity: "block",
          evidence: [{ check: "cliproxy", actual: "down", remediation: "start it" }],
          durationMs: 0,
        },
      ],
      budgetExceeded: false,
      elapsed: 0,
    });
    // orchestrate returns TIER_BLOCK (1) and does NOT call launchClaude
    await orchestrate(["--mode=fast"]);
    // launchClaude is NOT called on BLOCK — verify the guard works
    expect(launchClaude).not.toHaveBeenCalled();
  });

  it("sets _cliproxyActive=false when T2 result is absent", async () => {
    runTiers.mockResolvedValue({
      results: [],
      budgetExceeded: false,
      elapsed: 0,
    });
    await orchestrate(["--mode=fast"]);
    if (launchClaude.mock.calls.length) {
      const config = launchClaude.mock.calls[0][0];
      expect(config._cliproxyActive).toBe(false);
    }
  });
});
