/**
 * Codex review integration — invokes GPT-5.5 Codex review on code changes.
 *
 * @typedef {{ severity: "blocker"|"warning"|"info", file: string, line: number|null, message: string }} Finding
 * @typedef {{ ok: boolean, findings: Finding[], blockers: number, warnings: number, duration: number }} CodexReviewResult
 */

import { exec } from "../lib/shell.mjs";

/**
 * Run GPT-5.5 Codex review on the current working tree changes.
 *
 * @param {{ model?: string, effort?: string, timeout?: number }} options
 * @returns {Promise<CodexReviewResult>}
 */
export async function runCodexReview(options = {}) {
  const { model = "gpt-5.5", effort = "xhigh", timeout = 120_000 } = options;
  const start = performance.now();
  const result = await exec(`codex --review --model ${model} --effort ${effort}`, { timeout });
  const findings = result.ok ? parseCodexOutput(result.stdout) : [];
  const blockers = findings.filter((f) => f.severity === "blocker").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  return {
    ok: result.ok && blockers === 0,
    findings,
    blockers,
    warnings,
    duration: Math.round(performance.now() - start),
  };
}

/**
 * Parse Codex CLI stdout into structured Finding objects.
 *
 * Recognised line format:
 *   BLOCKER|WARNING|INFO  <file>:<line> - <message>
 *   BLOCKER|WARNING|INFO  <file> - <message>
 *
 * @param {string} stdout
 * @returns {Finding[]}
 */
export function parseCodexOutput(stdout) {
  if (!stdout) return [];
  const findings = [];
  for (const line of stdout.split("\n")) {
    // Two capture variants:
    //   with line:   SEVERITY <file>:<line> - <msg>
    //   without line: SEVERITY <file> - <msg>
    const match =
      line.match(/^(BLOCKER|WARNING|INFO)\s+(.+?):(\d+)\s*[:-]\s*(.+)/i) ||
      line.match(/^(BLOCKER|WARNING|INFO)\s+(.+?)\s+-\s+(.+)/i);
    if (match) {
      // Variant 1 produces 4 groups; variant 2 produces 3 groups (no line number).
      const hasLine = match.length === 5;
      findings.push({
        severity:
          match[1].toLowerCase() === "blocker"
            ? "blocker"
            : match[1].toLowerCase() === "warning"
              ? "warning"
              : "info",
        file: match[2],
        line: hasLine ? Number.parseInt(match[3], 10) : null,
        message: hasLine ? match[4].trim() : match[3].trim(),
      });
    }
  }
  return findings;
}
