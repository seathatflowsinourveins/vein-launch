/**
 * Tests for ship-gate.mjs — dual-model pre-merge quality gate.
 * Second model is now `codex review` (not claude --review).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/shell.mjs", () => ({
  exec: vi.fn(),
  execArgs: vi.fn(),
}));

const { execArgs } = await import("../../src/lib/shell.mjs");
const { runShipGate } = await import("../../src/quality/ship-gate.mjs");

function makeExecResult(stdout, ok = true) {
  return { ok, stdout, stderr: "", exitCode: ok ? 0 : 1, timedOut: false };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runShipGate", () => {
  it("runs both codex review passes in parallel (no claude --review)", async () => {
    execArgs.mockResolvedValue(makeExecResult(""));
    await runShipGate();
    expect(execArgs).toHaveBeenCalledTimes(2);
    const calls = execArgs.mock.calls;
    // Both calls must use 'codex' as the command — no 'claude' CLI invocation
    for (const [cmd] of calls) {
      expect(cmd).toBe("codex");
    }
    // Both must pass 'review' as first arg
    for (const [, args] of calls) {
      expect(args[0]).toBe("review");
    }
  });

  it("does NOT call the claude CLI (fixes broken --review subcommand)", async () => {
    execArgs.mockResolvedValue(makeExecResult(""));
    await runShipGate();
    const cmds = execArgs.mock.calls.map(([cmd]) => cmd);
    expect(cmds.every((c) => c !== "claude")).toBe(true);
  });

  it("returns passed=true when both codex reviews have 0 findings", async () => {
    execArgs.mockResolvedValue(makeExecResult("All good, no issues found."));
    const result = await runShipGate();
    expect(result.passed).toBe(true);
    expect(result.codexFindings).toBe(0);
    expect(result.claudeFindings).toBe(0);
  });

  it("returns passed=false when first codex review has findings", async () => {
    execArgs
      .mockResolvedValueOnce(makeExecResult("BLOCKER: null pointer dereference"))
      .mockResolvedValueOnce(makeExecResult("All looks clean."));
    const result = await runShipGate();
    expect(result.passed).toBe(false);
    expect(result.codexFindings).toBe(1);
    expect(result.claudeFindings).toBe(0);
  });

  it("returns passed=false when second codex review has findings", async () => {
    execArgs
      .mockResolvedValueOnce(makeExecResult("No issues."))
      .mockResolvedValueOnce(
        makeExecResult("WARNING: missing input validation\nWARNING: unused variable"),
      );
    const result = await runShipGate();
    expect(result.passed).toBe(false);
    expect(result.claudeFindings).toBe(2);
  });

  it("consensus includes 'both models approve' when clean", async () => {
    execArgs.mockResolvedValue(makeExecResult("LGTM"));
    const result = await runShipGate();
    expect(result.consensus).toContain("both models approve");
  });

  it("consensus includes finding counts when not clean", async () => {
    execArgs
      .mockResolvedValueOnce(makeExecResult("BLOCKER: crash on null"))
      .mockResolvedValueOnce(makeExecResult("WARNING: style issue\nBLOCKER: critical bug"));
    const result = await runShipGate();
    expect(result.consensus).toContain("codex: 1 finding(s)");
    expect(result.consensus).toContain("claude: 2 finding(s)");
    expect(result.consensus).not.toContain("both models approve");
  });

  it("fails closed when execArgs errors — passed is false", async () => {
    execArgs.mockResolvedValue(makeExecResult("", false));
    const result = await runShipGate();
    expect(result.codexFindings).toBe(-1);
    expect(result.claudeFindings).toBe(-1);
    expect(result.passed).toBe(false);
    expect(result.consensus).toContain("codex review failed — gate blocked");
  });

  it("duration is non-negative", async () => {
    execArgs.mockResolvedValue(makeExecResult(""));
    const result = await runShipGate();
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("counts multiple BLOCKER and WARNING tokens in output", async () => {
    execArgs
      .mockResolvedValueOnce(makeExecResult("BLOCKER: issue1\nBLOCKER: issue2\nWARNING: style"))
      .mockResolvedValueOnce(makeExecResult(""));
    const result = await runShipGate();
    expect(result.codexFindings).toBe(3);
    expect(result.passed).toBe(false);
  });

  it("codex review uses model gpt-5.5 and effort xhigh via -c flags", async () => {
    execArgs.mockResolvedValue(makeExecResult(""));
    await runShipGate();
    const calls = execArgs.mock.calls;
    for (const [, args] of calls) {
      const argsStr = args.join(" ");
      expect(argsStr).toContain("gpt-5.5");
      expect(argsStr).toContain("xhigh");
    }
  });
});
