/**
 * TierResult — the universal output type for all precheck tiers.
 *
 * Every tier's check() and repair() function returns a TierResult.
 * The orchestrator collects these to decide pass/warn/block/abort.
 *
 * @module result
 */

/** @enum {string} */
export const Severity = Object.freeze({
  PASS: "pass",
  INFO: "info",
  WARN: "warn",
  BLOCK: "block",
  SKIP: "skip",
  ERROR: "error",
});

/**
 * @typedef {Object} Evidence
 * @property {string} check - What was checked (e.g., "rtk binary on PATH")
 * @property {string} actual - What was found
 * @property {string} [expected] - What was expected (omit for info/pass)
 * @property {string} [remediation] - How to fix (required for warn/block)
 */

/**
 * @typedef {Object} TierResult
 * @property {string} tierId - Tier identifier (e.g., "t0-rtk")
 * @property {string} tierName - Human-readable name (e.g., "RTK")
 * @property {Severity} severity - Overall severity for this tier
 * @property {Evidence[]} evidence - Individual check results
 * @property {number} durationMs - Wall-clock time for this tier
 * @property {string} [cacheSource] - "memory" | "disk" | "network" | undefined
 * @property {Object} [diagnostics] - Freeform debug data (not displayed by default)
 */

/**
 * Create a TierResult.
 *
 * @param {Object} params
 * @param {string} params.tierId
 * @param {string} params.tierName
 * @param {Severity} params.severity
 * @param {Evidence[]} params.evidence
 * @param {number} params.durationMs
 * @param {string} [params.cacheSource]
 * @param {Object} [params.diagnostics]
 * @returns {TierResult}
 */
export function createResult({
  tierId,
  tierName,
  severity,
  evidence,
  durationMs,
  cacheSource,
  diagnostics,
}) {
  if (!tierId || typeof tierId !== "string") {
    throw new Error("tierId is required and must be a string");
  }
  if (!tierName || typeof tierName !== "string") {
    throw new Error("tierName is required and must be a string");
  }
  if (!Object.values(Severity).includes(severity)) {
    throw new Error(`Invalid severity: ${severity}`);
  }
  if (!Array.isArray(evidence)) {
    throw new Error("evidence must be an array");
  }
  if (typeof durationMs !== "number" || durationMs < 0 || Number.isNaN(durationMs)) {
    throw new Error(`durationMs must be a non-negative number, got: ${durationMs}`);
  }
  for (const e of evidence) {
    if (!e.check || !e.actual) {
      throw new Error("Each evidence item must have check and actual fields");
    }
    if ((severity === Severity.WARN || severity === Severity.BLOCK) && !e.remediation) {
      throw new Error(`Evidence for ${e.check} requires remediation when severity is ${severity}`);
    }
  }
  const frozenEvidence = Object.freeze(evidence.map((e) => Object.freeze({ ...e })));
  const frozenDiagnostics = diagnostics ? Object.freeze({ ...diagnostics }) : undefined;
  return Object.freeze({
    tierId,
    tierName,
    severity,
    evidence: frozenEvidence,
    durationMs,
    cacheSource,
    diagnostics: frozenDiagnostics,
  });
}

/**
 * Compute the worst severity from multiple TierResults.
 * Order: ERROR > BLOCK > WARN > INFO > SKIP > PASS
 *
 * @param {TierResult[]} results
 * @returns {Severity}
 */
export function worstSeverity(results) {
  const order = [
    Severity.PASS,
    Severity.SKIP,
    Severity.INFO,
    Severity.WARN,
    Severity.BLOCK,
    Severity.ERROR,
  ];
  let worst = 0;
  for (const r of results) {
    const idx = order.indexOf(r.severity);
    if (idx === -1) {
      throw new Error(`Unknown severity in tier ${r.tierId}: ${r.severity}`);
    }
    if (idx > worst) worst = idx;
  }
  return order[worst];
}

/** @type {Object<string, number>} */
export const ExitCodes = Object.freeze({
  SUCCESS: 0,
  TIER_WARN: 0,
  TIER_BLOCK: 1,
  TIER_ERROR: 2,
  CONFIG_INVALID: 3,
  SETUP_REQUIRED: 4,
  BUDGET_EXCEEDED: 5,
  INTERNAL_ERROR: 99,
});
