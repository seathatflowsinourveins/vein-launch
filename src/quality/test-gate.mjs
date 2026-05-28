/**
 * TeammateIdle quality gate — runs tests + lint when a teammate finishes.
 */

import { exec } from "../lib/shell.mjs";

/**
 * @typedef {Object} TestGateResult
 * @property {boolean} passed
 * @property {{ ok: boolean, output: string, stderr: string }} tests
 * @property {{ ok: boolean, output: string, stderr: string }} lint
 * @property {number} exitCode
 */

/**
 * Run project tests and linter, returning combined result.
 * @param {Object} options
 * @param {string} [options.testCmd="npx vitest run"]
 * @param {string} [options.lintCmd="npx biome check ."]
 * @param {number} [options.timeout=60000]
 * @returns {Promise<TestGateResult>}
 */
export async function runTestGate(options = {}) {
  const { testCmd = "npx vitest run", lintCmd = "npx biome check .", timeout = 60_000 } = options;

  const testsResult = await exec(testCmd, { timeout });
  const lintResult = await exec(lintCmd, { timeout });

  const passed = testsResult.ok && lintResult.ok;
  return {
    passed,
    tests: {
      ok: testsResult.ok,
      output: testsResult.stdout.slice(-500),
      stderr: testsResult.stderr,
    },
    lint: { ok: lintResult.ok, output: lintResult.stdout.slice(-500), stderr: lintResult.stderr },
    exitCode: passed ? 0 : 2,
  };
}
