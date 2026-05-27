/**
 * Tests for block-engine.mjs — declarative rule evaluation.
 *
 * fs.readFileSync is mocked so tests do not depend on the real rules file.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Severity } from "../../src/lib/result.mjs";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

const fs = await import("node:fs");
const { evaluateBlockRules, _resetRulesCache } = await import("../../src/lib/block-engine.mjs");

const TEST_RULES = {
  rules: [
    {
      id: "B5",
      name: "cliproxy-unhealthy",
      trigger: "health fails",
      severity: "block",
      tiers: ["t2-cliproxy"],
      remediation: "vein --repair",
      autoRepair: true,
    },
    {
      id: "B7",
      name: "github-auth-expired",
      trigger: "auth expired",
      severity: "block",
      tiers: ["t4-github"],
      remediation: "gh auth login",
      autoRepair: false,
    },
    {
      id: "B9",
      name: "mcp-version-drift",
      trigger: "version mismatch",
      severity: "block",
      tiers: ["t5-drift"],
      remediation: "npm install",
      autoRepair: true,
    },
  ],
};

function makeTierResult(tierId, severity) {
  return {
    tierId,
    tierName: tierId,
    severity,
    evidence: [{ check: "test", actual: "test" }],
    durationMs: 1,
  };
}

beforeEach(() => {
  _resetRulesCache();
  fs.readFileSync.mockReturnValue(JSON.stringify(TEST_RULES));
});

describe("evaluateBlockRules", () => {
  it("returns empty array when no results exist", () => {
    expect(evaluateBlockRules([])).toEqual([]);
  });

  it("returns empty array when all results are PASS severity", () => {
    const results = [
      makeTierResult("t2-cliproxy", Severity.PASS),
      makeTierResult("t4-github", Severity.PASS),
      makeTierResult("t5-drift", Severity.PASS),
    ];
    expect(evaluateBlockRules(results)).toEqual([]);
  });

  it("returns empty array when results are WARN (not BLOCK)", () => {
    const results = [
      makeTierResult("t2-cliproxy", Severity.WARN),
      makeTierResult("t4-github", Severity.WARN),
    ];
    expect(evaluateBlockRules(results)).toEqual([]);
  });

  it("returns empty array when results are INFO severity", () => {
    const results = [makeTierResult("t4-github", Severity.INFO)];
    expect(evaluateBlockRules(results)).toEqual([]);
  });

  it("triggers B7 when t4-github has BLOCK severity", () => {
    const results = [makeTierResult("t4-github", Severity.BLOCK)];
    const triggered = evaluateBlockRules(results);
    expect(triggered).toHaveLength(1);
    expect(triggered[0].id).toBe("B7");
    expect(triggered[0].name).toBe("github-auth-expired");
  });

  it("triggers B9 when t5-drift has BLOCK severity", () => {
    const results = [makeTierResult("t5-drift", Severity.BLOCK)];
    const triggered = evaluateBlockRules(results);
    expect(triggered).toHaveLength(1);
    expect(triggered[0].id).toBe("B9");
    expect(triggered[0].name).toBe("mcp-version-drift");
  });

  it("triggers B5 when t2-cliproxy has BLOCK severity", () => {
    const results = [makeTierResult("t2-cliproxy", Severity.BLOCK)];
    const triggered = evaluateBlockRules(results);
    expect(triggered).toHaveLength(1);
    expect(triggered[0].id).toBe("B5");
    expect(triggered[0].name).toBe("cliproxy-unhealthy");
  });

  it("returns autoRepair=true for B5", () => {
    const results = [makeTierResult("t2-cliproxy", Severity.BLOCK)];
    const [rule] = evaluateBlockRules(results);
    expect(rule.autoRepair).toBe(true);
  });

  it("returns autoRepair=false for B7", () => {
    const results = [makeTierResult("t4-github", Severity.BLOCK)];
    const [rule] = evaluateBlockRules(results);
    expect(rule.autoRepair).toBe(false);
  });

  it("returns autoRepair=true for B9", () => {
    const results = [makeTierResult("t5-drift", Severity.BLOCK)];
    const [rule] = evaluateBlockRules(results);
    expect(rule.autoRepair).toBe(true);
  });

  it("returns correct matchedTiers array", () => {
    const results = [makeTierResult("t4-github", Severity.BLOCK)];
    const [rule] = evaluateBlockRules(results);
    expect(rule.matchedTiers).toEqual(["t4-github"]);
  });

  it("does not trigger rules for tiers not in the rule's tiers array", () => {
    // t0-rtk is not in any test rule's tiers
    const results = [makeTierResult("t0-rtk", Severity.BLOCK)];
    expect(evaluateBlockRules(results)).toEqual([]);
  });

  it("multiple rules can trigger simultaneously", () => {
    const results = [
      makeTierResult("t2-cliproxy", Severity.BLOCK),
      makeTierResult("t4-github", Severity.BLOCK),
      makeTierResult("t5-drift", Severity.BLOCK),
    ];
    const triggered = evaluateBlockRules(results);
    expect(triggered).toHaveLength(3);
    const ids = triggered.map((r) => r.id);
    expect(ids).toContain("B5");
    expect(ids).toContain("B7");
    expect(ids).toContain("B9");
  });

  it("triggered rule has correct full structure", () => {
    const results = [makeTierResult("t4-github", Severity.BLOCK)];
    const [rule] = evaluateBlockRules(results);
    expect(rule).toMatchObject({
      id: "B7",
      name: "github-auth-expired",
      trigger: "auth expired",
      severity: "block",
      remediation: "gh auth login",
      autoRepair: false,
      matchedTiers: ["t4-github"],
    });
  });

  it("non-BLOCK tiers mixed with BLOCK tiers only trigger for BLOCK ones", () => {
    const results = [
      makeTierResult("t2-cliproxy", Severity.PASS),
      makeTierResult("t4-github", Severity.BLOCK),
      makeTierResult("t5-drift", Severity.WARN),
    ];
    const triggered = evaluateBlockRules(results);
    expect(triggered).toHaveLength(1);
    expect(triggered[0].id).toBe("B7");
  });
});
