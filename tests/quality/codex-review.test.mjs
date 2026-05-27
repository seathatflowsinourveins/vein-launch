/**
 * Tests for src/quality/codex-review.mjs
 *
 * shell.mjs is mocked so no real `codex` binary is required.
 * runCodexReview now uses execArgs (array form, shell:false).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock shell before importing the module under test — expose both exec and execArgs
vi.mock("../../src/lib/shell.mjs", () => ({
  exec: vi.fn(),
  execArgs: vi.fn(),
}));

import { execArgs } from "../../src/lib/shell.mjs";
import { parseCodexOutput, runCodexReview } from "../../src/quality/codex-review.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExecOk(stdout = "") {
  return { ok: true, stdout, stderr: "", exitCode: 0, timedOut: false };
}

function makeExecFail(stderr = "codex not found") {
  return { ok: false, stdout: "", stderr, exitCode: 1, timedOut: false };
}

// ---------------------------------------------------------------------------
// runCodexReview
// ---------------------------------------------------------------------------

describe("runCodexReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls execArgs with 'codex' and 'review' subcommand", async () => {
    execArgs.mockResolvedValue(makeExecOk());
    await runCodexReview();
    expect(execArgs).toHaveBeenCalledOnce();
    const [cmd, args] = execArgs.mock.calls[0];
    expect(cmd).toBe("codex");
    expect(args[0]).toBe("review");
  });

  it("passes default model gpt-5.5 and effort xhigh as -c flags", async () => {
    execArgs.mockResolvedValue(makeExecOk());
    await runCodexReview();
    const [, args] = execArgs.mock.calls[0];
    const argsStr = args.join(" ");
    expect(argsStr).toContain("gpt-5.5");
    expect(argsStr).toContain("xhigh");
  });

  it("passes custom model and effort through to execArgs", async () => {
    execArgs.mockResolvedValue(makeExecOk());
    await runCodexReview({ model: "gpt-4o", effort: "low" });
    const [, args] = execArgs.mock.calls[0];
    const argsStr = args.join(" ");
    expect(argsStr).toContain("gpt-4o");
    expect(argsStr).toContain("low");
  });

  it("passes custom timeout to execArgs options", async () => {
    execArgs.mockResolvedValue(makeExecOk());
    await runCodexReview({ timeout: 5000 });
    const [, , opts] = execArgs.mock.calls[0];
    expect(opts.timeout).toBe(5000);
  });

  it("returns ok:true when exec succeeds and no blockers are found", async () => {
    execArgs.mockResolvedValue(makeExecOk("INFO src/foo.mjs:1 - looks good"));
    const result = await runCodexReview();
    expect(result.ok).toBe(true);
    expect(result.blockers).toBe(0);
  });

  it("returns ok:false when exec succeeds but blockers are found", async () => {
    execArgs.mockResolvedValue(makeExecOk("BLOCKER src/foo.mjs:10 - null deref"));
    const result = await runCodexReview();
    expect(result.ok).toBe(false);
    expect(result.blockers).toBe(1);
  });

  it("returns ok:false when exec itself fails (non-zero exit)", async () => {
    execArgs.mockResolvedValue(makeExecFail());
    const result = await runCodexReview();
    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(0);
  });

  it("counts blockers and warnings correctly", async () => {
    const stdout = [
      "BLOCKER src/a.mjs:1 - bad",
      "BLOCKER src/b.mjs:2 - worse",
      "WARNING src/c.mjs:3 - caution",
      "INFO src/d.mjs - fyi",
    ].join("\n");
    execArgs.mockResolvedValue(makeExecOk(stdout));
    const result = await runCodexReview();
    expect(result.blockers).toBe(2);
    expect(result.warnings).toBe(1);
    expect(result.findings).toHaveLength(4);
  });

  it("includes a numeric duration in milliseconds", async () => {
    execArgs.mockResolvedValue(makeExecOk());
    const result = await runCodexReview();
    expect(typeof result.duration).toBe("number");
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// parseCodexOutput
// ---------------------------------------------------------------------------

describe("parseCodexOutput", () => {
  it("returns empty array for empty string", () => {
    expect(parseCodexOutput("")).toHaveLength(0);
  });

  it("returns empty array for null/undefined", () => {
    expect(parseCodexOutput(null)).toHaveLength(0);
    expect(parseCodexOutput(undefined)).toHaveLength(0);
  });

  it("parses a BLOCKER line with file and line number", () => {
    const findings = parseCodexOutput("BLOCKER src/foo.mjs:42 - null pointer dereference");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("blocker");
    expect(findings[0].file).toBe("src/foo.mjs");
    expect(findings[0].line).toBe(42);
    expect(findings[0].message).toBe("null pointer dereference");
  });

  it("parses a WARNING line with file and line number", () => {
    const findings = parseCodexOutput("WARNING src/bar.mjs:7 - unused variable");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].file).toBe("src/bar.mjs");
    expect(findings[0].line).toBe(7);
    expect(findings[0].message).toBe("unused variable");
  });

  it("parses an INFO line with file and line number", () => {
    const findings = parseCodexOutput("INFO src/baz.mjs:3 - consider extracting helper");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
  });

  it("parses a line without a line number (line is null)", () => {
    const findings = parseCodexOutput("WARNING src/qux.mjs - missing JSDoc");
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBeNull();
    expect(findings[0].file).toBe("src/qux.mjs");
  });

  it("extracts file and line number together", () => {
    const findings = parseCodexOutput("BLOCKER src/tiers/t0.mjs:99 - unsafe eval");
    expect(findings[0].file).toBe("src/tiers/t0.mjs");
    expect(findings[0].line).toBe(99);
  });

  it("ignores lines that do not match the pattern", () => {
    const stdout = ["Running review...", "  checking files", "Done."].join("\n");
    expect(parseCodexOutput(stdout)).toHaveLength(0);
  });

  it("parses multiple findings from multi-line output", () => {
    const stdout = [
      "BLOCKER src/a.mjs:1 - bad thing",
      "WARNING src/b.mjs:5 - questionable",
      "INFO src/c.mjs:10 - note",
      "Noise line — ignored",
    ].join("\n");
    const findings = parseCodexOutput(stdout);
    expect(findings).toHaveLength(3);
  });

  it("is case-insensitive for severity keywords", () => {
    const findings = parseCodexOutput("blocker src/x.mjs:1 - lower case blocker");
    expect(findings[0].severity).toBe("blocker");
  });
});
