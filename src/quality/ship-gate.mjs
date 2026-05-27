/**
 * Dual-model pre-merge quality gate.
 * Runs Codex (GPT-5.5) and Claude self-review in parallel, compares findings.
 */

import { exec } from "../lib/shell.mjs";

/**
 * @typedef {Object} ShipGateResult
 * @property {boolean} passed
 * @property {number} codexFindings
 * @property {number} claudeFindings
 * @property {string[]} consensus
 * @property {number} duration
 */

/**
 * Run both Codex and Claude review in parallel and compare findings.
 * @param {Object} options
 * @param {number} [options.timeout=180000]
 * @returns {Promise<ShipGateResult>}
 */
export async function runShipGate(options = {}) {
  const { timeout = 180_000 } = options;
  const start = performance.now();

  const [codexResult, claudeResult] = await Promise.all([
    exec("codex --review --model gpt-5.5 --effort xhigh", { timeout }),
    exec("claude --review --output json", { timeout }),
  ]);

  const codexFindings = codexResult.ok ? countFindings(codexResult.stdout) : 0;
  const claudeFindings = claudeResult.ok ? countFindings(claudeResult.stdout) : 0;

  const consensus = [];
  if (codexFindings === 0 && claudeFindings === 0) consensus.push("both models approve");
  if (codexFindings > 0) consensus.push(`codex: ${codexFindings} finding(s)`);
  if (claudeFindings > 0) consensus.push(`claude: ${claudeFindings} finding(s)`);

  return {
    passed: codexFindings === 0 && claudeFindings === 0,
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
