/**
 * Hook handler for TeammateIdle event.
 * Runs test gate and returns exit code 2 on failure to force teammate to fix.
 * Provides structured failure context so idle teammates get actionable error details.
 */

import { runTestGate } from "../quality/test-gate.mjs";

/**
 * @typedef {Object} TestFailure
 * @property {string} file
 * @property {number} line
 * @property {string} message
 */

/**
 * @typedef {Object} TeammateIdleResult
 * @property {boolean} passed
 * @property {number} exitCode
 * @property {string} message
 * @property {TestFailure[]} [failures]
 */

/**
 * Parse vitest stderr output for test failure details.
 * Matches FAIL/x/x markers and extracts file:line references.
 * @param {string} stderr
 * @returns {TestFailure[]}
 */
export function parseTestFailures(stderr) {
  if (!stderr) return [];
  const lines = stderr.split("\n");
  const failures = [];
  for (let i = 0; i < lines.length; i++) {
    if (/FAIL|[✗×✕✘]/.test(lines[i])) {
      // Search next 5 lines for a file:line reference
      const window = lines.slice(i, i + 5).join("\n");
      const fileMatch = window.match(/(\S+\.(?:test|spec)\.\w+):(\d+)/);
      failures.push({
        file: fileMatch?.[1] ?? "unknown",
        line: Number.parseInt(fileMatch?.[2] ?? "0", 10),
        message: lines[i].trim(),
      });
    }
  }
  return failures;
}

/**
 * Handle a TeammateIdle event by running the quality gate.
 * Returns exitCode=2 on failure to signal the teammate must fix issues.
 * @param {unknown} _event
 * @param {Object} options
 * @returns {Promise<TeammateIdleResult>}
 */
export async function handleTeammateIdle(_event, options = {}) {
  try {
    const result = await runTestGate(options);

    if (!result.tests.ok) {
      const failures = parseTestFailures(result.tests.stderr);
      const failureDetail =
        failures.length > 0
          ? `\n${failures.map((f) => `  ${f.file}:${f.line} — ${f.message}`).join("\n")}`
          : "";
      return {
        passed: false,
        exitCode: 2,
        message: `Fix ${failures.length || "test"} test failure(s):${failureDetail}\ntests=${result.tests.ok}, lint=${result.lint.ok}`,
        failures,
      };
    }

    if (!result.lint.ok) {
      return {
        passed: false,
        exitCode: 2,
        message: `Fix lint errors:\n${result.lint.stderr || result.lint.output}`,
      };
    }

    return {
      passed: true,
      exitCode: 0,
      message: "All gates passed",
    };
  } catch (err) {
    return { passed: false, exitCode: 2, message: `Gate error: ${err.message}` };
  }
}
