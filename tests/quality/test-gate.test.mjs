/**
 * Tests for test-gate.mjs — TeammateIdle quality gate.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/shell.mjs", () => ({
  exec: vi.fn(),
}));

const { exec } = await import("../../src/lib/shell.mjs");
const { runTestGate } = await import("../../src/quality/test-gate.mjs");

function makeExecResult(stdout, ok = true) {
  return { ok, stdout, stderr: "", exitCode: ok ? 0 : 1, timedOut: false };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runTestGate", () => {
  it("returns passed=true when tests and lint both pass", async () => {
    exec.mockResolvedValue(makeExecResult("All tests passed"));
    const result = await runTestGate();
    expect(result.passed).toBe(true);
    expect(result.tests.ok).toBe(true);
    expect(result.lint.ok).toBe(true);
  });

  it("returns passed=false when tests fail", async () => {
    exec
      .mockResolvedValueOnce(makeExecResult("1 test failed", false))
      .mockResolvedValueOnce(makeExecResult("No lint errors"));
    const result = await runTestGate();
    expect(result.passed).toBe(false);
    expect(result.tests.ok).toBe(false);
    expect(result.lint.ok).toBe(true);
  });

  it("returns passed=false when lint fails", async () => {
    exec
      .mockResolvedValueOnce(makeExecResult("All tests passed"))
      .mockResolvedValueOnce(makeExecResult("Lint error: trailing comma", false));
    const result = await runTestGate();
    expect(result.passed).toBe(false);
    expect(result.tests.ok).toBe(true);
    expect(result.lint.ok).toBe(false);
  });

  it("exitCode=0 on pass, exitCode=2 on fail", async () => {
    exec.mockResolvedValue(makeExecResult("OK"));
    const passing = await runTestGate();
    expect(passing.exitCode).toBe(0);

    exec
      .mockResolvedValueOnce(makeExecResult("fail", false))
      .mockResolvedValueOnce(makeExecResult("OK"));
    const failing = await runTestGate();
    expect(failing.exitCode).toBe(2);
  });

  it("output is truncated to last 500 chars", async () => {
    const longOutput = "x".repeat(1000);
    exec.mockResolvedValue(makeExecResult(longOutput));
    const result = await runTestGate();
    expect(result.tests.output.length).toBe(500);
    expect(result.lint.output.length).toBe(500);
  });

  it("uses custom commands from options", async () => {
    exec.mockResolvedValue(makeExecResult("OK"));
    await runTestGate({ testCmd: "custom-test", lintCmd: "custom-lint" });
    const cmds = exec.mock.calls.map((c) => c[0]);
    expect(cmds).toContain("custom-test");
    expect(cmds).toContain("custom-lint");
  });
});
