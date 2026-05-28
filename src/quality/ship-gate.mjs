/**
 * Dual-model pre-merge quality gate.
 * Runs two independent Codex review passes in parallel using DIFFERENT models
 * to get genuinely distinct perspectives on the diff.
 *
 * Pass 1 (codex): GPT-5.5 @ xhigh — deep reasoning, catches subtle correctness bugs.
 * Pass 2 (claude): GPT-5.4-mini @ medium — fast heuristic scan, catches different patterns
 *   (style drift, obvious errors, missing error handling) that the heavy model may deprioritize.
 *
 * Security: all arguments are passed as arrays via execArgs (shell:false).
 */

import { execArgs } from "../lib/shell.mjs";

/**
 * @typedef {Object} ShipGateResult
 * @property {boolean} passed
 * @property {number} codexFindings
 * @property {number} claudeFindings
 * @property {string[]} consensus
 * @property {number} duration
 */

/**
 * Build the codex review args array for the given model and effort.
 * Uses `-c key=value` config overrides (not --model/--effort flags which don't exist on `review`).
 *
 * @param {string} model
 * @param {string} effort
 * @returns {string[]}
 */
function codexReviewArgs(model, effort) {
  return ["review", "-c", `model="${model}"`, "-c", `effort="${effort}"`];
}

/** Default models for each pass — deliberately different to get independent perspectives. */
const PASS1_MODEL = "gpt-5.5";
const PASS1_EFFORT = "xhigh";
const PASS2_MODEL = "gpt-5.4-mini";
const PASS2_EFFORT = "medium";

/**
 * Run two independent Codex review passes in parallel using different models.
 * Pass 1 uses GPT-5.5 @ xhigh; Pass 2 uses GPT-5.4-mini @ medium.
 * Callers may override the Pass 1 model/effort; Pass 2 always uses the cheap-lane model
 * to ensure the two perspectives are genuinely distinct.
 *
 * @param {Object} options
 * @param {string} [options.model="gpt-5.5"]   Pass 1 model
 * @param {string} [options.effort="xhigh"]    Pass 1 effort
 * @param {string} [options.model2="gpt-5.4-mini"]  Pass 2 model
 * @param {string} [options.effort2="medium"]  Pass 2 effort
 * @param {number} [options.timeout=180000]
 * @returns {Promise<ShipGateResult>}
 */
export async function runShipGate(options = {}) {
  const {
    model = PASS1_MODEL,
    effort = PASS1_EFFORT,
    model2 = PASS2_MODEL,
    effort2 = PASS2_EFFORT,
    timeout = 180_000,
  } = options;
  const start = performance.now();

  // Pass 1: GPT-5.5 xhigh — deep correctness review
  // Pass 2: GPT-5.4-mini medium — fast heuristic scan with a different model
  const [codexResult, claudeResult] = await Promise.all([
    execArgs("codex", codexReviewArgs(model, effort), { timeout }),
    execArgs("codex", codexReviewArgs(model2, effort2), { timeout }),
  ]);

  const codexFailed = !codexResult.ok;
  const claudeFailed = !claudeResult.ok;
  const codexFindings = codexResult.ok ? countFindings(codexResult.stdout) : -1;
  const claudeFindings = claudeResult.ok ? countFindings(claudeResult.stdout) : -1;

  const consensus = [];
  if (codexFailed) consensus.push("codex review failed — gate blocked");
  if (claudeFailed) consensus.push("codex review failed — gate blocked");
  if (!codexFailed && codexFindings === 0 && !claudeFailed && claudeFindings === 0)
    consensus.push("both models approve");
  if (codexFindings > 0) consensus.push(`codex: ${codexFindings} finding(s)`);
  if (claudeFindings > 0) consensus.push(`claude: ${claudeFindings} finding(s)`);

  return {
    passed: !codexFailed && !claudeFailed && codexFindings === 0 && claudeFindings === 0,
    codexFindings,
    claudeFindings,
    consensus,
    duration: Math.round(performance.now() - start),
  };
}

/**
 * Count BLOCKER/WARNING occurrences in review output.
 * @param {string} stdout
 * @returns {number}
 */
function countFindings(stdout) {
  return (stdout.match(/BLOCKER|WARNING/gi) || []).length;
}
