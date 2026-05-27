/**
 * Dual-model pre-merge quality gate.
 * Runs two independent Codex (GPT-5.5) review passes in parallel and compares findings.
 *
 * Previously this file invoked `claude --review --output json`, which is NOT a real Claude Code
 * CLI subcommand and caused the gate to always return passed=false silently. It is now replaced
 * with a second `codex review` pass (same model, same effort) for a true dual-pass gate.
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

/**
 * Run two independent Codex review passes in parallel and compare findings.
 * @param {Object} options
 * @param {string} [options.model="gpt-5.5"]
 * @param {string} [options.effort="xhigh"]
 * @param {number} [options.timeout=180000]
 * @returns {Promise<ShipGateResult>}
 */
export async function runShipGate(options = {}) {
  const { model = "gpt-5.5", effort = "xhigh", timeout = 180_000 } = options;
  const start = performance.now();

  // Two independent codex review passes — no claude CLI involved.
  const args = codexReviewArgs(model, effort);
  const [codexResult, claudeResult] = await Promise.all([
    execArgs("codex", args, { timeout }),
    execArgs("codex", args, { timeout }),
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
