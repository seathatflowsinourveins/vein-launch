/**
 * Tests for task-completed.mjs — TaskCompleted event hook (agent-teams self-correction).
 *
 * Covers the two behaviors that distinguish it from teammate-idle:
 *   - project-detection guard (hasTestSetup) — skip on non-vitest/biome repos
 *   - FAIL-OPEN on gate errors — a crashed gate must never trap the teammate loop
 */

import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/quality/test-gate.mjs", () => ({
  runTestGate: vi.fn(),
}));

const { runTestGate } = await import("../../src/quality/test-gate.mjs");
const { handleTaskCompleted, hasTestSetup } = await import("../../src/hooks/task-completed.mjs");

// vein-launch repo root — has biome.json + vitest config + vitest in package.json.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function makeGateResult(testsOk = true, lintOk = true) {
  return {
    tests: { ok: testsOk, output: "", stderr: "" },
    lint: { ok: lintOk, output: "", stderr: "" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hasTestSetup", () => {
  it("returns true for a repo with biome/vitest setup", () => {
    expect(hasTestSetup(repoRoot)).toBe(true);
  });

  it("returns false for a directory with no test setup", () => {
    expect(hasTestSetup(tmpdir())).toBe(false);
  });
});

describe("handleTaskCompleted", () => {
  it("skips (passed, exit 0) WITHOUT running the gate when there is no test setup", async () => {
    const result = await handleTaskCompleted({}, { cwd: tmpdir() });
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(runTestGate).not.toHaveBeenCalled();
  });

  it("returns passed=true, exit 0 when the gate passes", async () => {
    runTestGate.mockResolvedValue(makeGateResult(true, true));
    const result = await handleTaskCompleted({}, { cwd: repoRoot });
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("returns exit 2 when tests fail", async () => {
    runTestGate.mockResolvedValue(makeGateResult(false, true));
    const result = await handleTaskCompleted({}, { cwd: repoRoot });
    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(2);
  });

  it("returns exit 2 when lint fails", async () => {
    runTestGate.mockResolvedValue(makeGateResult(true, false));
    const result = await handleTaskCompleted({}, { cwd: repoRoot });
    expect(result.exitCode).toBe(2);
  });

  it("FAILS OPEN (passed, exit 0) when the gate throws — never traps the loop", async () => {
    runTestGate.mockRejectedValue(new Error("exec timeout"));
    const result = await handleTaskCompleted({}, { cwd: repoRoot });
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("exec timeout");
  });

  it("passes options through to the gate", async () => {
    runTestGate.mockResolvedValue(makeGateResult(true, true));
    const opts = { cwd: repoRoot, timeout: 30_000 };
    await handleTaskCompleted({}, opts);
    expect(runTestGate).toHaveBeenCalledWith(opts);
  });
});
