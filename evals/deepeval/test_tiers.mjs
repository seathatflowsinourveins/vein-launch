/**
 * evals/deepeval/test_tiers.mjs — DeepEval behavioral evaluation suite.
 *
 * Vitest-compatible test file that replaces the promptfoo exec-provider pattern.
 * Each test scenario invokes the orchestrator in --eval-mode and scores the output
 * against the rubric.json dimensions (tier_activation, exit_code_contract,
 * result_shape, fast_mode_budget, json_validity) using the same weighted formula
 * as evals/assertions/tier-report.js.
 *
 * Migration: DEPRECATED promptfoo path kept in behavioral_eval.mjs (--engine promptfoo).
 *            This file is the authoritative eval engine (--engine deepeval, default).
 *
 * Run:
 *   npx vitest run evals/deepeval/ --reporter=verbose
 *   npm run eval
 */

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

/** Absolute path to the repo root (two levels up from evals/deepeval/) */
const REPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");

/** Load rubric weights once */
const rubric = JSON.parse(readFileSync(join(REPO_ROOT, "evals", "rubric.json"), "utf8"));

// ---------------------------------------------------------------------------
// DeepEval assertion engine — mirrors the rubric scoring from tier-report.js
// ---------------------------------------------------------------------------

/**
 * Score an orchestrator --eval-mode output against the 5-dimension rubric.
 *
 * @param {string} stdout   - raw stdout from the orchestrator
 * @param {object} vars     - scenario variables (mode, expectError, expectedMinTiers)
 * @returns {{ pass: boolean, score: number, reason: string, dimensions: object }}
 */
function scoreOutput(stdout, vars = {}) {
  const scores = {};
  const reasons = [];

  // --- Dimension: json_validity (0.10) ---
  let parsed = null;
  try {
    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) throw new Error("no JSON object found");
    parsed = JSON.parse(stdout.slice(jsonStart));
    if (parsed.schema !== "vein-eval-v1") {
      scores.json_validity = 0.5;
      reasons.push("schema field missing or not vein-eval-v1");
    } else {
      scores.json_validity = 1.0;
    }
  } catch (err) {
    scores.json_validity = 0.0;
    reasons.push(`JSON parse failed: ${err.message}`);
    if (vars.expectError) {
      try {
        const errorStart = stdout.indexOf("{");
        if (errorStart !== -1) {
          const errParsed = JSON.parse(stdout.slice(errorStart));
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

  if (vars.expectError) {
    const hasError = parsed?.error != null || stdout.indexOf('"error"') !== -1;
    scores.exit_code_contract = hasError ? 1.0 : 0.0;
    scores.tier_activation = hasError ? 1.0 : 0.0;
    scores.result_shape = 1.0;
    scores.fast_mode_budget = 1.0;
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
      const hasFastViolation = tierIds.some((id) => /^t[456]/.test(id));
      scores.fast_mode_budget = hasFastViolation ? 0.0 : 1.0;
      if (hasFastViolation) reasons.push("fast mode ran T4+ tiers (budget violation)");
    } else if (mode === "deep") {
      scores.fast_mode_budget = results.length > 0 ? 1.0 : 0.5;
    } else {
      scores.fast_mode_budget = 1.0;
    }
  } else {
    scores.exit_code_contract = 0.0;
    scores.tier_activation = 0.0;
    scores.result_shape = 0.0;
    scores.fast_mode_budget = 0.0;
    reasons.push("unexpected error in output");
    if (parsed?.error) reasons.push(`error: ${parsed.error}`);
  }

  // Compute weighted composite score (rubric.json dimensions)
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

  return { pass, score: finalScore, reason, dimensions: scores };
}

/**
 * Run the orchestrator in --eval-mode with the given args.
 *
 * @param {string} args  - space-separated CLI args
 * @returns {Promise<{ stdout: string, exitCode: number }>}
 */
async function runEvalMode(args) {
  let stdout = "";
  let exitCode = 0;
  try {
    const result = await execFileAsync(
      "node",
      ["src/cli.mjs", "--eval-mode", ...args.trim().split(/\s+/).filter(Boolean)],
      { shell: false, cwd: REPO_ROOT, timeout: 30_000 },
    );
    stdout = result.stdout;
  } catch (err) {
    stdout = err.stdout ?? "";
    exitCode = err.code ?? 1;
  }
  return { stdout, exitCode };
}

// ---------------------------------------------------------------------------
// Scenarios (mirrors the 5 promptfoo test cases in promptfooconfig.yaml)
// ---------------------------------------------------------------------------

describe("DeepEval behavioral scenarios — vein-launch orchestrator", () => {
  // (a) Fast mode against current cwd — pass case
  it("fast-pass: fast mode completes and emits well-formed eval JSON", async () => {
    const { stdout } = await runEvalMode("--mode=fast");
    const result = scoreOutput(stdout, { mode: "fast", expectError: false, expectedMinTiers: 1 });

    expect(
      result.score,
      `DeepEval score below pass_threshold: ${result.reason}`,
    ).toBeGreaterThanOrEqual(rubric.pass_threshold);
    expect(result.pass, result.reason).toBe(true);
  });

  // (b) Deep mode against current cwd — pass case
  it("deep-pass: deep mode completes and emits well-formed eval JSON", async () => {
    const { stdout } = await runEvalMode("--mode=deep");
    const result = scoreOutput(stdout, { mode: "deep", expectError: false, expectedMinTiers: 1 });

    expect(
      result.score,
      `DeepEval score below pass_threshold: ${result.reason}`,
    ).toBeGreaterThanOrEqual(rubric.pass_threshold);
    expect(result.pass, result.reason).toBe(true);
  });

  // (c) Invalid mode flag — should emit error JSON (not a silent crash)
  it("invalid-mode: invalid --mode flag emits error JSON", async () => {
    const { stdout } = await runEvalMode("--mode=invalid");
    const result = scoreOutput(stdout, { expectError: true });

    expect(
      result.score,
      `DeepEval score below pass_threshold: ${result.reason}`,
    ).toBeGreaterThanOrEqual(rubric.pass_threshold);
    expect(result.pass, result.reason).toBe(true);
  });

  // (d) Nonexistent project arg — should fail gracefully with JSON output
  it("nonexistent-project: nonexistent project path emits graceful output", async () => {
    const { stdout } = await runEvalMode("/nonexistent/path/that/does/not/exist");
    const result = scoreOutput(stdout, { expectError: false, expectedMinTiers: 1 });

    expect(
      result.score,
      `DeepEval score below pass_threshold: ${result.reason}`,
    ).toBeGreaterThanOrEqual(rubric.pass_threshold);
    expect(result.pass, result.reason).toBe(true);
  });

  // (e) Fast mode with --ci flag — must NOT launch Claude, still emit eval JSON
  it("fast-ci: fast mode with --ci does not launch Claude and emits eval JSON", async () => {
    const { stdout } = await runEvalMode("--mode=fast --ci");
    const result = scoreOutput(stdout, { mode: "fast", expectError: false, expectedMinTiers: 1 });

    // Additional assertion: --ci output must not reference launchClaude
    expect(stdout, "--ci flag must not trigger Claude launch").not.toContain("launchClaude");

    expect(
      result.score,
      `DeepEval score below pass_threshold: ${result.reason}`,
    ).toBeGreaterThanOrEqual(rubric.pass_threshold);
    expect(result.pass, result.reason).toBe(true);
  });
});
