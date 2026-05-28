/**
 * Tests for tools/behavioral_eval.mjs — Wave 11-B1
 *
 * All promptfoo exec calls are injected via the `runner` parameter so no
 * actual promptfoo invocation occurs.  Tests verify:
 *   - mocked output parses correctly and returns numeric behavioralScore
 *   - pass/fail counts are extracted from results.stats correctly
 *   - partial-failure output (some tests fail) still yields a score
 *   - legacy top-level stats field is handled (older promptfoo compat)
 *   - malformed JSON throws a descriptive error
 *   - missing stats field throws a descriptive error
 */

import { describe, expect, it } from "vitest";
import { runBehavioralEval } from "../../tools/behavioral_eval.mjs";

// ---------------------------------------------------------------------------
// Helpers — build minimal promptfoo JSON output shapes
// ---------------------------------------------------------------------------

function makePromptfooOutput({ successes, failures, topLevel = false }) {
  const stats = { successes, failures };
  const obj = topLevel ? { stats, results: { table: [] } } : { results: { stats, table: [] } };
  return JSON.stringify(obj);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runBehavioralEval", () => {
  it("returns behavioralScore=100 when all scenarios pass", async () => {
    const runner = async () => makePromptfooOutput({ successes: 5, failures: 0 });
    const result = await runBehavioralEval({ engine: "promptfoo", runner });

    expect(result.behavioralScore).toBe(100);
    expect(result.details.passCount).toBe(5);
    expect(result.details.failCount).toBe(0);
    expect(result.details.totalCount).toBe(5);
    expect(result.details.passRate).toBe(1);
  });

  it("returns behavioralScore=0 when all scenarios fail", async () => {
    const runner = async () => makePromptfooOutput({ successes: 0, failures: 5 });
    const result = await runBehavioralEval({ engine: "promptfoo", runner });

    expect(result.behavioralScore).toBe(0);
    expect(result.details.passCount).toBe(0);
    expect(result.details.failCount).toBe(5);
    expect(result.details.totalCount).toBe(5);
    expect(result.details.passRate).toBe(0);
  });

  it("returns correct partial score when some scenarios fail", async () => {
    const runner = async () => makePromptfooOutput({ successes: 3, failures: 2 });
    const result = await runBehavioralEval({ engine: "promptfoo", runner });

    expect(result.behavioralScore).toBe(60);
    expect(result.details.passCount).toBe(3);
    expect(result.details.failCount).toBe(2);
    expect(result.details.totalCount).toBe(5);
    expect(result.details.passRate).toBeCloseTo(0.6);
  });

  it("handles legacy top-level stats field (older promptfoo compat)", async () => {
    const runner = async () => makePromptfooOutput({ successes: 4, failures: 1, topLevel: true });
    const result = await runBehavioralEval({ engine: "promptfoo", runner });

    expect(result.behavioralScore).toBe(80);
    expect(result.details.passCount).toBe(4);
  });

  it("handles stdout with leading non-JSON text before the JSON object", async () => {
    const runner = async () =>
      `Starting eval...\nSome progress line\n${makePromptfooOutput({ successes: 2, failures: 0 })}`;
    const result = await runBehavioralEval({ engine: "promptfoo", runner });
    expect(result.behavioralScore).toBe(100);
  });

  it("returns behavioralScore=0 when totalCount is 0", async () => {
    const runner = async () => makePromptfooOutput({ successes: 0, failures: 0 });
    const result = await runBehavioralEval({ engine: "promptfoo", runner });
    expect(result.behavioralScore).toBe(0);
    expect(result.details.totalCount).toBe(0);
    expect(result.details.passRate).toBe(0);
  });

  it("throws a descriptive error when output has no JSON object", async () => {
    const runner = async () => "no json here at all";
    await expect(runBehavioralEval({ engine: "promptfoo", runner })).rejects.toThrow(/no JSON/);
  });

  it("throws a descriptive error when JSON is malformed", async () => {
    const runner = async () => "{ broken json {{";
    await expect(runBehavioralEval({ engine: "promptfoo", runner })).rejects.toThrow(
      /failed to parse/,
    );
  });

  it("throws a descriptive error when stats field is missing", async () => {
    const runner = async () => JSON.stringify({ results: { table: [] } });
    await expect(runBehavioralEval({ engine: "promptfoo", runner })).rejects.toThrow(/missing/);
  });
});
