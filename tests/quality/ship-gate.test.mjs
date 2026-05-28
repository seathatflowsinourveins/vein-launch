/**
 * Tests for ship-gate.mjs — true dual-model pre-merge quality gate.
 * Pass 1: GPT-5.5 @ xhigh (deep correctness review)
 * Pass 2: GPT-5.4-mini @ medium (fast heuristic scan — different model = different perspective)
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

  it("pass 1 uses gpt-5.5 @ xhigh, pass 2 uses gpt-5.4-mini @ medium (different models)", async () => {
    execArgs.mockResolvedValue(makeExecResult(""));
    await runShipGate();
    const calls = execArgs.mock.calls;
    expect(calls).toHaveLength(2);

    // Pass 1: GPT-5.5 xhigh
    const pass1Args = calls[0][1].join(" ");
    expect(pass1Args).toContain("gpt-5.5");
    expect(pass1Args).toContain("xhigh");

    // Pass 2: GPT-5.4-mini medium — must differ from pass 1
    const pass2Args = calls[1][1].join(" ");
    expect(pass2Args).toContain("gpt-5.4-mini");
    expect(pass2Args).toContain("medium");

    // The two passes must use DIFFERENT models (the core fix)
    expect(pass1Args).not.toEqual(pass2Args);
  });

  it("caller can override pass 1 model/effort independently of pass 2", async () => {
    execArgs.mockResolvedValue(makeExecResult(""));
    await runShipGate({ model: "gpt-4o", effort: "high" });
    const calls = execArgs.mock.calls;
    const pass1Args = calls[0][1].join(" ");
    const pass2Args = calls[1][1].join(" ");
    // Pass 1 uses the override
    expect(pass1Args).toContain("gpt-4o");
    expect(pass1Args).toContain("high");
    // Pass 2 still uses its own default cheap-lane model
    expect(pass2Args).toContain("gpt-5.4-mini");
    expect(pass2Args).toContain("medium");
  });
});
