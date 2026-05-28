/**
 * Tests for enhanced teammate-idle.mjs — parseTestFailures + structured feedback.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/quality/test-gate.mjs", () => ({
  runTestGate: vi.fn(),
}));

const { runTestGate } = await import("../../src/quality/test-gate.mjs");
const { parseTestFailures, handleTeammateIdle } = await import("../../src/hooks/teammate-idle.mjs");

// ---------------------------------------------------------------------------
// parseTestFailures — unit tests
// ---------------------------------------------------------------------------

describe("parseTestFailures", () => {
  it("returns empty array for empty string", () => {
    expect(parseTestFailures("")).toEqual([]);
  });

  it("returns empty array for undefined/null input", () => {
    expect(parseTestFailures(undefined)).toEqual([]);
    expect(parseTestFailures(null)).toEqual([]);
  });

  it("extracts failure from FAIL marker with file:line", () => {
    const stderr = [
      "FAIL tests/hooks/teammate-idle.test.mjs",
      "  AssertionError: expected true to be false",
      "  at tests/hooks/teammate-idle.test.mjs:42:5",
    ].join("\n");
    const failures = parseTestFailures(stderr);
    expect(failures).toHaveLength(1);
    expect(failures[0].file).toBe("tests/hooks/teammate-idle.test.mjs");
    expect(failures[0].line).toBe(42);
    expect(failures[0].message).toContain("FAIL");
  });

  it("extracts failure from x marker (unicode cross)", () => {
    const stderr = [
      "  ✗ returns passed=true when gate passes",
      "    at tests/quality/test-gate.test.mjs:28:3",
    ].join("\n");
    const failures = parseTestFailures(stderr);
    expect(failures).toHaveLength(1);
    expect(failures[0].file).toBe("tests/quality/test-gate.test.mjs");
    expect(failures[0].line).toBe(28);
  });

  it("extracts multiple failures from stderr", () => {
    const stderr = [
      "FAIL tests/team.test.mjs",
      "  Error: expected 1 to be 2",
      "  at tests/team.test.mjs:10:1",
      "FAIL tests/lib/config.test.mjs",
      "  Error: bad config",
      "  at tests/lib/config.test.mjs:55:7",
    ].join("\n");
    const failures = parseTestFailures(stderr);
    expect(failures).toHaveLength(2);
    expect(failures[0].file).toBe("tests/team.test.mjs");
    expect(failures[1].file).toBe("tests/lib/config.test.mjs");
  });

  it("uses unknown file and line 0 when no file:line found", () => {
    const stderr = "FAIL some random message with no path";
    const failures = parseTestFailures(stderr);
    expect(failures).toHaveLength(1);
    expect(failures[0].file).toBe("unknown");
    expect(failures[0].line).toBe(0);
  });

  it("sets message to the trimmed failing line", () => {
    const stderr = "  FAIL   tests/foo.test.mjs  ";
    const failures = parseTestFailures(stderr);
    expect(failures[0].message).toBe("FAIL   tests/foo.test.mjs");
  });
});

// ---------------------------------------------------------------------------
// handleTeammateIdle — structured feedback integration
// ---------------------------------------------------------------------------

function makeGateResult({
  passed,
  testsOk = true,
  lintOk = true,
  testStderr = "",
  lintStderr = "",
}) {
  return {
    passed,
    tests: { ok: testsOk, output: "", stderr: testStderr },
    lint: { ok: lintOk, output: "", stderr: lintStderr },
    exitCode: passed ? 0 : 2,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleTeammateIdle (enhanced)", () => {
  it("returns failures array on test failure", async () => {
    const testStderr = [
      "FAIL tests/team.test.mjs",
      "  Error: expected 1 to be 2",
      "  at tests/team.test.mjs:10:1",
    ].join("\n");
    runTestGate.mockResolvedValue(makeGateResult({ passed: false, testsOk: false, testStderr }));

    const result = await handleTeammateIdle({});
    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.failures).toBeDefined();
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].file).toBe("tests/team.test.mjs");
  });

  it("message includes file:line from failures", async () => {
    const testStderr = ["FAIL tests/lib/shell.test.mjs", "  at tests/lib/shell.test.mjs:99:3"].join(
      "\n",
    );
    runTestGate.mockResolvedValue(makeGateResult({ passed: false, testsOk: false, testStderr }));

    const result = await handleTeammateIdle({});
    expect(result.message).toContain("tests/lib/shell.test.mjs:99");
  });

  it("includes lint stderr in message when lint fails", async () => {
    const lintStderr = "error: trailing comma at src/team.mjs:5:10";
    runTestGate.mockResolvedValue(makeGateResult({ passed: false, lintOk: false, lintStderr }));

    const result = await handleTeammateIdle({});
    expect(result.passed).toBe(false);
    expect(result.message).toContain("trailing comma");
  });

  it("returns passed=true with no failures when all gates pass", async () => {
    runTestGate.mockResolvedValue(makeGateResult({ passed: true }));
    const result = await handleTeammateIdle({});
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.message).toBe("All gates passed");
    expect(result.failures).toBeUndefined();
  });

  it("handles error thrown by test gate", async () => {
    runTestGate.mockRejectedValue(new Error("exec timeout"));
    const result = await handleTeammateIdle({});
    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain("exec timeout");
  });
});
