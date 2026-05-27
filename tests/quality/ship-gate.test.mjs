/**
 * Tests for ship-gate.mjs — dual-model pre-merge quality gate.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/shell.mjs", () => ({
  exec: vi.fn(),
}));

const { exec } = await import("../../src/lib/shell.mjs");
const { runShipGate } = await import("../../src/quality/ship-gate.mjs");

function makeExecResult(stdout, ok = true) {
  return { ok, stdout, stderr: "", exitCode: ok ? 0 : 1, timedOut: false };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runShipGate", () => {
  it("runs both codex and claude review in parallel", async () => {
    exec.mockResolvedValue(makeExecResult(""));
    await runShipGate();
    expect(exec).toHaveBeenCalledTimes(2);
    const calls = exec.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes("codex"))).toBe(true);
    expect(calls.some((c) => c.includes("claude"))).toBe(true);
  });

  it("returns passed=true when both models have 0 findings", async () => {
    exec.mockResolvedValue(makeExecResult("All good, no issues found."));
    const result = await runShipGate();
    expect(result.passed).toBe(true);
    expect(result.codexFindings).toBe(0);
    expect(result.claudeFindings).toBe(0);
  });

  it("returns passed=false when codex has findings", async () => {
    exec
      .mockResolvedValueOnce(makeExecResult("BLOCKER: null pointer dereference"))
      .mockResolvedValueOnce(makeExecResult("All looks clean."));
    const result = await runShipGate();
    expect(result.passed).toBe(false);
    expect(result.codexFindings).toBe(1);
    expect(result.claudeFindings).toBe(0);
  });

  it("returns passed=false when claude has findings", async () => {
    exec
      .mockResolvedValueOnce(makeExecResult("No issues."))
      .mockResolvedValueOnce(
        makeExecResult("WARNING: missing input validation\nWARNING: unused variable"),
      );
    const result = await runShipGate();
    expect(result.passed).toBe(false);
    expect(result.claudeFindings).toBe(2);
  });

  it("consensus includes 'both models approve' when clean", async () => {
    exec.mockResolvedValue(makeExecResult("LGTM"));
    const result = await runShipGate();
    expect(result.consensus).toContain("both models approve");
  });

  it("consensus includes finding counts when not clean", async () => {
    exec
      .mockResolvedValueOnce(makeExecResult("BLOCKER: crash on null"))
      .mockResolvedValueOnce(makeExecResult("WARNING: style issue\nBLOCKER: critical bug"));
    const result = await runShipGate();
    expect(result.consensus).toContain("codex: 1 finding(s)");
    expect(result.consensus).toContain("claude: 2 finding(s)");
    expect(result.consensus).not.toContain("both models approve");
  });

  it("fails closed when exec errors — passed is false", async () => {
    exec.mockResolvedValue(makeExecResult("", false));
    const result = await runShipGate();
    expect(result.codexFindings).toBe(-1);
    expect(result.claudeFindings).toBe(-1);
    expect(result.passed).toBe(false);
    expect(result.consensus).toContain("codex review failed — gate blocked");
  });

  it("duration is non-negative", async () => {
    exec.mockResolvedValue(makeExecResult(""));
    const result = await runShipGate();
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("counts multiple BLOCKER and WARNING tokens in output", async () => {
    exec
      .mockResolvedValueOnce(makeExecResult("BLOCKER: issue1\nBLOCKER: issue2\nWARNING: style"))
      .mockResolvedValueOnce(makeExecResult(""));
    const result = await runShipGate();
    expect(result.codexFindings).toBe(3);
    expect(result.passed).toBe(false);
  });
});
