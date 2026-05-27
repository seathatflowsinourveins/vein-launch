/**
 * Tests for teammate-idle.mjs — TeammateIdle event hook.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/quality/test-gate.mjs", () => ({
  runTestGate: vi.fn(),
}));

const { runTestGate } = await import("../../src/quality/test-gate.mjs");
const { handleTeammateIdle } = await import("../../src/hooks/teammate-idle.mjs");

function makeGateResult(passed, testsOk = true, lintOk = true) {
  return {
    passed,
    tests: { ok: testsOk, output: "" },
    lint: { ok: lintOk, output: "" },
    exitCode: passed ? 0 : 2,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleTeammateIdle", () => {
  it("returns passed=true when test gate passes", async () => {
    runTestGate.mockResolvedValue(makeGateResult(true));
    const result = await handleTeammateIdle({});
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("returns exitCode=2 when test gate fails", async () => {
    runTestGate.mockResolvedValue(makeGateResult(false, false, true));
    const result = await handleTeammateIdle({});
    expect(result.exitCode).toBe(2);
    expect(result.passed).toBe(false);
  });

  it("message describes failure reason when tests fail", async () => {
    runTestGate.mockResolvedValue(makeGateResult(false, false, true));
    const result = await handleTeammateIdle({});
    expect(result.message).toContain("tests=false");
    expect(result.message).toContain("lint=true");
  });

  it("handles error thrown by test gate", async () => {
    runTestGate.mockRejectedValue(new Error("exec timeout"));
    const result = await handleTeammateIdle({});
    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain("exec timeout");
  });

  it("passes options through to test gate", async () => {
    runTestGate.mockResolvedValue(makeGateResult(true));
    const opts = { testCmd: "custom-test", lintCmd: "custom-lint", timeout: 30_000 };
    await handleTeammateIdle({}, opts);
    expect(runTestGate).toHaveBeenCalledWith(opts);
  });
});
