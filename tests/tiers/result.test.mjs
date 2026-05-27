import { describe, expect, it } from "vitest";
import { createResult, ExitCodes, Severity, worstSeverity } from "../../src/lib/result.mjs";

describe("TierResult", () => {
  it("creates a frozen pass result", () => {
    const result = createResult({
      tierId: "t0-rtk",
      tierName: "RTK",
      severity: Severity.PASS,
      evidence: [{ check: "binary", actual: "rtk v0.42.0" }],
      durationMs: 12,
    });

    expect(result.tierId).toBe("t0-rtk");
    expect(result.severity).toBe("pass");
    expect(result.evidence).toHaveLength(1);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("rejects invalid severity", () => {
    expect(() =>
      createResult({
        tierId: "t0",
        tierName: "T0",
        severity: "invalid",
        evidence: [],
        durationMs: 0,
      }),
    ).toThrow("Invalid severity");
  });

  it("requires remediation for block severity", () => {
    expect(() =>
      createResult({
        tierId: "t2",
        tierName: "CLIProxy",
        severity: Severity.BLOCK,
        evidence: [{ check: "health", actual: "unreachable" }],
        durationMs: 100,
      }),
    ).toThrow("requires remediation");
  });

  it("allows block with remediation", () => {
    const result = createResult({
      tierId: "t2",
      tierName: "CLIProxy",
      severity: Severity.BLOCK,
      evidence: [{ check: "health", actual: "unreachable", remediation: "vein --repair" }],
      durationMs: 100,
    });

    expect(result.severity).toBe("block");
    expect(result.evidence[0].remediation).toBe("vein --repair");
  });

  it("requires remediation for warn severity", () => {
    expect(() =>
      createResult({
        tierId: "t5",
        tierName: "Drift",
        severity: Severity.WARN,
        evidence: [{ check: "mcp-version", actual: "2.0.0 vs 3.0.0" }],
        durationMs: 50,
      }),
    ).toThrow("requires remediation");
  });

  it("deep-freezes evidence and diagnostics", () => {
    const result = createResult({
      tierId: "t0",
      tierName: "T0",
      severity: Severity.PASS,
      evidence: [{ check: "a", actual: "ok" }],
      durationMs: 0,
      diagnostics: { key: "val" },
    });

    expect(Object.isFrozen(result.evidence)).toBe(true);
    expect(Object.isFrozen(result.evidence[0])).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });

  it("rejects missing tierId", () => {
    expect(() =>
      createResult({
        tierId: "",
        tierName: "T",
        severity: Severity.PASS,
        evidence: [],
        durationMs: 0,
      }),
    ).toThrow("tierId is required");
  });

  it("rejects non-array evidence", () => {
    expect(() =>
      createResult({
        tierId: "t0",
        tierName: "T",
        severity: Severity.PASS,
        evidence: "bad",
        durationMs: 0,
      }),
    ).toThrow("evidence must be an array");
  });

  it("rejects negative durationMs", () => {
    expect(() =>
      createResult({
        tierId: "t0",
        tierName: "T",
        severity: Severity.PASS,
        evidence: [],
        durationMs: -1,
      }),
    ).toThrow("non-negative number");
  });

  it("rejects evidence without check/actual", () => {
    expect(() =>
      createResult({
        tierId: "t0",
        tierName: "T",
        severity: Severity.PASS,
        evidence: [{ foo: "bar" }],
        durationMs: 0,
      }),
    ).toThrow("check and actual");
  });

  it("includes optional fields", () => {
    const result = createResult({
      tierId: "t2",
      tierName: "CLIProxy",
      severity: Severity.PASS,
      evidence: [{ check: "cache", actual: "cache_read_input_tokens: 1423" }],
      durationMs: 500,
      cacheSource: "network",
      diagnostics: { cacheHealth: true },
    });

    expect(result.cacheSource).toBe("network");
    expect(result.diagnostics.cacheHealth).toBe(true);
  });
});

describe("worstSeverity", () => {
  it("returns pass for all-pass results", () => {
    const results = [
      createResult({
        tierId: "t0",
        tierName: "T0",
        severity: Severity.PASS,
        evidence: [{ check: "a", actual: "ok" }],
        durationMs: 0,
      }),
      createResult({
        tierId: "t1",
        tierName: "T1",
        severity: Severity.PASS,
        evidence: [{ check: "b", actual: "ok" }],
        durationMs: 0,
      }),
    ];
    expect(worstSeverity(results)).toBe(Severity.PASS);
  });

  it("returns block when any result is block", () => {
    const results = [
      createResult({
        tierId: "t0",
        tierName: "T0",
        severity: Severity.PASS,
        evidence: [{ check: "a", actual: "ok" }],
        durationMs: 0,
      }),
      createResult({
        tierId: "t2",
        tierName: "T2",
        severity: Severity.BLOCK,
        evidence: [{ check: "b", actual: "fail", remediation: "fix" }],
        durationMs: 0,
      }),
    ];
    expect(worstSeverity(results)).toBe(Severity.BLOCK);
  });

  it("rejects unknown severity", () => {
    const badResult = { tierId: "t0", severity: "bogus" };
    expect(() => worstSeverity([badResult])).toThrow("Unknown severity");
  });

  it("error beats block", () => {
    const results = [
      createResult({
        tierId: "t0",
        tierName: "T0",
        severity: Severity.ERROR,
        evidence: [{ check: "a", actual: "crash", remediation: "fix" }],
        durationMs: 0,
      }),
      createResult({
        tierId: "t2",
        tierName: "T2",
        severity: Severity.BLOCK,
        evidence: [{ check: "b", actual: "fail", remediation: "fix" }],
        durationMs: 0,
      }),
    ];
    expect(worstSeverity(results)).toBe(Severity.ERROR);
  });
});

describe("ExitCodes", () => {
  it("has expected values", () => {
    expect(ExitCodes.SUCCESS).toBe(0);
    expect(ExitCodes.TIER_BLOCK).toBe(1);
    expect(ExitCodes.TIER_ERROR).toBe(2);
    expect(ExitCodes.CONFIG_INVALID).toBe(3);
    expect(ExitCodes.INTERNAL_ERROR).toBe(99);
  });
});
