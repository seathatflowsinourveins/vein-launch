/**
 * tier-report.js — promptfoo JavaScript assertion for vein-launch eval scenarios.
 * DEPRECATED — migrating to DeepEval. Remove after Wave 13.
 *
 * Loaded via:  assert: [{ type: javascript, value: "file://evals/assertions/tier-report.js" }]
 *
 * Scoring formula (composite weighted rubric from evals/rubric.json):
 *   tier_activation  (0.30) — at least one tier result present in output
 *   exit_code_contract (0.25) — exit code matches expected contract for the scenario
 *   result_shape     (0.20) — each result has tierId, severity, durationMs, hasEvidence
 *   fast_mode_budget (0.15) — fast mode only includes T0-T3; deep mode includes T4+
 *   json_validity    (0.10) — output is parseable JSON with schema:vein-eval-v1
 *
 * Returns: { pass: boolean, score: number (0-1), reason: string }
 *
 * Context object provided by promptfoo:
 *   vars     — test vars (mode, args, expectError, expectedMinTiers, etc.)
 *   prompt   — rendered prompt string
 *   output   — stdout string from exec provider
 */

const fs = require("node:fs");
const path = require("node:path");

// Load rubric — resolve relative to this file so it works from any cwd
const rubricPath = path.join(__dirname, "..", "rubric.json");
const rubric = JSON.parse(fs.readFileSync(rubricPath, "utf8"));

/**
 * Main assertion function called by promptfoo.
 *
 * @param {string} output  - stdout from the exec provider
 * @param {{ vars: object, prompt: string }} context
 * @returns {{ pass: boolean, score: number, reason: string }}
 */
function assertion(output, context) {
  const vars = context?.vars ?? {};
  const scores = {};
  const reasons = [];

  // --- Dimension: json_validity (0.10) ---
  let parsed = null;
  try {
    // The exec provider may prefix with non-JSON lines; find first JSON object
    const jsonStart = output.indexOf("{");
    if (jsonStart === -1) throw new Error("no JSON object found");
    parsed = JSON.parse(output.slice(jsonStart));
    if (parsed.schema !== "vein-eval-v1") {
      scores.json_validity = 0.5;
      reasons.push("schema field missing or not vein-eval-v1");
    } else {
      scores.json_validity = 1.0;
    }
  } catch (err) {
    scores.json_validity = 0.0;
    reasons.push(`JSON parse failed: ${err.message}`);
    // If we expected an error response, still check for error field
    if (vars.expectError) {
      try {
        const errorStart = output.indexOf("{");
        if (errorStart !== -1) {
          const errParsed = JSON.parse(output.slice(errorStart));
          if (errParsed.error) {
            scores.json_validity = 0.7;
            reasons.push("error JSON emitted as expected");
          }
        }
      } catch {
        // ignore secondary parse failure
      }
    }
  }

  // If we expected an error (config invalid / unknown flag), score differently
  if (vars.expectError) {
    const hasError = parsed?.error != null || output.indexOf('"error"') !== -1;
    scores.exit_code_contract = hasError ? 1.0 : 0.0;
    scores.tier_activation = hasError ? 1.0 : 0.0; // no tiers expected
    scores.result_shape = 1.0; // n/a for error path
    scores.fast_mode_budget = 1.0; // n/a for error path
    if (!hasError) reasons.push("expected error response but none found");
  } else if (parsed && !parsed.error) {
    const results = parsed.results ?? [];

    // --- Dimension: tier_activation (0.30) ---
    const minTiers = vars.expectedMinTiers ?? 1;
    scores.tier_activation = results.length >= minTiers ? 1.0 : results.length / minTiers;
    if (results.length < minTiers) {
      reasons.push(`expected ≥${minTiers} tier results, got ${results.length}`);
    }

    // --- Dimension: exit_code_contract (0.25) ---
    // For non-error scenarios the schema must be present and mode must match
    const expectedMode = vars.mode ?? null;
    if (expectedMode && parsed.mode !== expectedMode) {
      scores.exit_code_contract = 0.0;
      reasons.push(`mode mismatch: expected ${expectedMode}, got ${parsed.mode}`);
    } else {
      scores.exit_code_contract = 1.0;
    }

    // --- Dimension: result_shape (0.20) ---
    if (results.length === 0) {
      scores.result_shape = 0.5;
      reasons.push("no tier results to validate shape");
    } else {
      const shapePassed = results.filter(
        (r) =>
          typeof r.tierId === "string" &&
          typeof r.severity === "string" &&
          typeof r.durationMs === "number" &&
          typeof r.hasEvidence === "boolean",
      ).length;
      scores.result_shape = shapePassed / results.length;
      if (shapePassed < results.length) {
        reasons.push(`${results.length - shapePassed} results had invalid shape`);
      }
    }

    // --- Dimension: fast_mode_budget (0.15) ---
    const mode = parsed.mode;
    const tierIds = results.map((r) => r.tierId);
    if (mode === "fast") {
      // Fast mode must NOT include T4-T6
      const hasFastViolation = tierIds.some((id) => /^t[456]/.test(id));
      scores.fast_mode_budget = hasFastViolation ? 0.0 : 1.0;
      if (hasFastViolation) reasons.push("fast mode ran T4+ tiers (budget violation)");
    } else if (mode === "deep") {
      // Deep mode should include T4+ (if available/not skipped)
      // We only penalize if zero tiers ran at all — T4 may legitimately be skipped
      scores.fast_mode_budget = results.length > 0 ? 1.0 : 0.5;
    } else {
      scores.fast_mode_budget = 1.0; // other modes: no constraint
    }
  } else {
    // parsed is null or has error field but expectError was not set
    scores.exit_code_contract = 0.0;
    scores.tier_activation = 0.0;
    scores.result_shape = 0.0;
    scores.fast_mode_budget = 0.0;
    reasons.push("unexpected error in output");
    if (parsed?.error) reasons.push(`error: ${parsed.error}`);
  }

  // Compute weighted composite score
  const { dimensions, pass_threshold } = rubric;
  let totalWeight = 0;
  let weightedScore = 0;
  for (const [dim, { weight }] of Object.entries(dimensions)) {
    const dimScore = scores[dim] ?? 0;
    weightedScore += dimScore * weight;
    totalWeight += weight;
  }
  const finalScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

  const pass = finalScore >= pass_threshold;
  const reason =
    reasons.length > 0
      ? `score=${finalScore.toFixed(3)} (${reasons.join("; ")})`
      : `score=${finalScore.toFixed(3)} — all dimensions passed`;

  return { pass, score: finalScore, reason };
}

module.exports = assertion;
