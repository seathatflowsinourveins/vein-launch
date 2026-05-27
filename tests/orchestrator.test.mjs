/**
 * Integration tests for orchestrate() — verifies the end-to-end mode routing,
 * config validation, and launch behaviour without spawning a real process.
 *
 * All I/O side-effects are mocked: launchClaude (exec), persistResults, and
 * runTiers (runner) so tests do not depend on rtk/tooling being installed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock all dependencies BEFORE importing orchestrate
vi.mock("../src/lib/exec.mjs", () => ({
  launchClaude: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/persist.mjs", () => ({
  persistResults: vi.fn().mockResolvedValue({}),
}));

vi.mock("../src/lib/runner.mjs", () => ({
  runTiers: vi.fn().mockResolvedValue({
    results: [
      {
        tierId: "t0-rtk",
        severity: "pass",
        durationMs: 12,
        evidence: [{ check: "rtk", actual: "found" }],
      },
      {
        tierId: "t1-env",
        severity: "pass",
        durationMs: 5,
        evidence: [],
      },
    ],
    budgetExceeded: false,
    elapsed: 17,
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
// --eval-mode tests (Wave 11-B1)
// ---------------------------------------------------------------------------

describe("orchestrate --eval-mode", () => {
  let stdoutSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    // Capture process.stdout.write calls so we can inspect the JSON emitted
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it("emits valid JSON to stdout with schema vein-eval-v1", async () => {
    const code = await orchestrate(["--eval-mode", "--mode=fast"]);
    expect(code).toBe(0);

    // Find the JSON write call
    const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const parsed = JSON.parse(written.trim());

    expect(parsed.schema).toBe("vein-eval-v1");
    expect(parsed.version).toBe("1.0");
    expect(parsed.mode).toBe("fast");
    expect(Array.isArray(parsed.results)).toBe(true);
  });

  it("emits result entries with required shape (tierId, severity, durationMs, hasEvidence)", async () => {
    await orchestrate(["--eval-mode", "--mode=fast"]);

    const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const parsed = JSON.parse(written.trim());

    expect(parsed.results.length).toBeGreaterThan(0);
    for (const r of parsed.results) {
      expect(typeof r.tierId).toBe("string");
      expect(typeof r.severity).toBe("string");
      expect(typeof r.durationMs).toBe("number");
      expect(typeof r.hasEvidence).toBe("boolean");
    }
  });

  it("does NOT call launchClaude in --eval-mode", async () => {
    await orchestrate(["--eval-mode", "--mode=fast"]);
    expect(launchClaude).not.toHaveBeenCalled();
  });

  it("does NOT call persistResults in --eval-mode", async () => {
    const { persistResults } = await import("../src/lib/persist.mjs");
    await orchestrate(["--eval-mode", "--mode=fast"]);
    expect(persistResults).not.toHaveBeenCalled();
  });

  it("returns CONFIG_INVALID (3) for invalid mode in --eval-mode", async () => {
    const code = await orchestrate(["--eval-mode", "--mode=invalid"]);
    expect(code).toBe(3);

    const written = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    const parsed = JSON.parse(written.trim());
    expect(typeof parsed.error).toBe("string");
  });

  it("calls runTiers once in --eval-mode (reuses existing tier-runner logic)", async () => {
    await orchestrate(["--eval-mode", "--mode=fast"]);
    expect(runTiers).toHaveBeenCalledTimes(1);
  });
});
