/**
 * Hook handler for TeammateIdle event.
 * Runs test gate and returns exit code 2 on failure to force teammate to fix.
 */

import { runTestGate } from "../quality/test-gate.mjs";

/**
 * @typedef {Object} TeammateIdleResult
 * @property {boolean} passed
 * @property {number} exitCode
 * @property {string} message
 */

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
    return {
      passed: result.passed,
      exitCode: result.exitCode,
      message: result.passed
        ? "Tests and lint passed"
        : `Quality gate failed: tests=${result.tests.ok}, lint=${result.lint.ok}`,
    };
  } catch (err) {
    return { passed: false, exitCode: 2, message: `Gate error: ${err.message}` };
  }
}
