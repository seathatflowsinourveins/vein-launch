/**
 * Hook handler for the TaskCompleted event (agent-teams self-correction).
 * Runs the project quality gate after a task finishes; returns exit code 2 on a
 * genuine test/lint failure so the teammate auto-fixes and re-claims the task.
 *
 * Differs from the TeammateIdle handler in two safety-critical ways, because
 * TaskCompleted fires on EVERY task in EVERY project (the hook is user-scoped):
 *   1. Project-detection guard — if cwd has no vitest/biome setup, skip (pass).
 *      The gate runs `npx vitest run` / `npx biome check .`; without that setup it
 *      would fail (or npx would try to download), trapping teammates in non-JS repos.
 *   2. Fail-open on gate ERRORS — a crashed/timed-out gate returns pass (exit 0), so a
 *      broken gate never traps the loop. Only a clean test/lint FAILURE blocks (exit 2).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runTestGate } from "../quality/test-gate.mjs";
import { parseTestFailures } from "./teammate-idle.mjs";

/**
 * Detect whether cwd is a project the vitest/biome gate can meaningfully run on.
 * @param {string} cwd
 * @returns {boolean}
 */
export function hasTestSetup(cwd) {
  for (const f of [
    "biome.json",
    "biome.jsonc",
    "vitest.config.ts",
    "vitest.config.js",
    "vitest.config.mjs",
  ]) {
    if (existsSync(join(cwd, f))) return true;
  }
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.vitest || deps["@biomejs/biome"]) return true;
      if (pkg.scripts && typeof pkg.scripts.test === "string" && /vitest/.test(pkg.scripts.test)) {
        return true;
      }
    } catch {
      // Unreadable package.json -> treat as "no setup" so we skip rather than trap.
      return false;
    }
  }
  return false;
}

/**
 * @typedef {Object} TaskGateResult
 * @property {boolean} passed
 * @property {number} exitCode
 * @property {string} message
 */

/**
 * Handle a TaskCompleted event by running the quality gate, guarded + fail-open.
 * @param {unknown} _event
 * @param {Object} [options]
 * @param {string} [options.cwd]
 * @returns {Promise<TaskGateResult>}
 */
export async function handleTaskCompleted(_event, options = {}) {
  const cwd = options.cwd ?? process.cwd();

  if (!hasTestSetup(cwd)) {
    return {
      passed: true,
      exitCode: 0,
      message: `task-completed: no vitest/biome setup in ${cwd} — gate skipped`,
    };
  }

  try {
    const result = await runTestGate(options);

    if (!result.tests.ok) {
      const failures = parseTestFailures(result.tests.stderr);
      const detail =
        failures.length > 0
          ? `\n${failures.map((f) => `  ${f.file}:${f.line} — ${f.message}`).join("\n")}`
          : "";
      return {
        passed: false,
        exitCode: 2,
        message: `Fix ${failures.length || "test"} test failure(s) before completing:${detail}`,
      };
    }

    if (!result.lint.ok) {
      return {
        passed: false,
        exitCode: 2,
        message: `Fix lint errors before completing:\n${result.lint.stderr || result.lint.output}`,
      };
    }

    return { passed: true, exitCode: 0, message: "Quality gate passed (tests + lint)" };
  } catch (err) {
    // FAIL-OPEN: a gate crash/timeout must never trap the teammate loop.
    return {
      passed: true,
      exitCode: 0,
      message: `task-completed: gate error, failing open — ${err.message}`,
    };
  }
}
