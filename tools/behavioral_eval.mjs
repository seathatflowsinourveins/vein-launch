/**
 * behavioral_eval.mjs — Behavioral evaluation runner.
 *
 * Supports two engines:
 *   --engine deepeval (default) — runs vitest against evals/deepeval/
 *   --engine promptfoo          — legacy: runs promptfoo eval (kept for transition)
 *
 * Usage (programmatic):
 *   import { runBehavioralEval } from "./tools/behavioral_eval.mjs";
 *   const { behavioralScore, details } = await runBehavioralEval();                   // deepeval
 *   const { behavioralScore, details } = await runBehavioralEval({ engine: "promptfoo" }); // legacy
 *
 * Exit codes (when run as main):
 *   0 — all scenarios passed
 *   1 — some scenarios failed or infrastructure error
 */

import { exec, execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

/** Absolute path to the repo root (two levels up from tools/) */
const REPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..");

/** Default promptfoo config path */
const DEFAULT_PROMPTFOO_CONFIG = join(REPO_ROOT, "evals", "promptfooconfig.yaml");

/** DeepEval test directory */
const DEEPEVAL_DIR = join(REPO_ROOT, "evals", "deepeval");

/**
 * @typedef {Object} BehavioralEvalResult
 * @property {number} behavioralScore  - 0-100 pass rate across all scenarios
 * @property {{ passCount: number, failCount: number, totalCount: number, passRate: number }} details
 * @property {"deepeval"|"promptfoo"} engine  - which engine was used
 */

/**
 * Run the behavioral evaluation suite and return a normalized result.
 *
 * @param {{
 *   engine?: "deepeval"|"promptfoo",
 *   configPath?: string,
 *   runner?: (configPath: string) => Promise<string>,
 * }} opts
 * @returns {Promise<BehavioralEvalResult>}
 */
export async function runBehavioralEval({
  engine = "deepeval",
  configPath = DEFAULT_PROMPTFOO_CONFIG,
  runner,
} = {}) {
  if (engine === "promptfoo") {
    return runPromptfooEval({ configPath, runner });
  }
  return runDeepEvalEval({ runner });
}

// ---------------------------------------------------------------------------
// DeepEval engine (default) — vitest runner
// ---------------------------------------------------------------------------

/**
 * Run the DeepEval suite via `npx vitest run evals/deepeval/ --reporter=json`.
 * Parses vitest JSON reporter output to extract pass/fail counts.
 *
 * @param {{ runner?: () => Promise<string> }} opts
 * @returns {Promise<BehavioralEvalResult>}
 */
async function runDeepEvalEval({ runner = defaultVitestRunner } = {}) {
  const rawOutput = await runner();

  // vitest --reporter=json writes a JSON object to stdout
  const jsonStart = rawOutput.indexOf("{");
  if (jsonStart === -1) {
    throw new Error("behavioral_eval(deepeval): vitest --reporter=json produced no JSON in stdout");
  }

  let vt;
  try {
    vt = JSON.parse(rawOutput.slice(jsonStart));
  } catch (err) {
    throw new Error(`behavioral_eval(deepeval): failed to parse vitest JSON: ${err.message}`);
  }

  // vitest JSON reporter: numPassedTests, numFailedTests, numTotalTests
  const passCount = vt.numPassedTests ?? 0;
  const failCount = vt.numFailedTests ?? 0;
  const totalCount = vt.numTotalTests ?? passCount + failCount;
  const passRate = totalCount > 0 ? passCount / totalCount : 0;
  const behavioralScore = Math.round(passRate * 100);

  return {
    behavioralScore,
    details: { passCount, failCount, totalCount, passRate },
    engine: "deepeval",
  };
}

/**
 * Default DeepEval runner: spawns `npx vitest run evals/deepeval/ --reporter=json`.
 *
 * @returns {Promise<string>}
 */
async function defaultVitestRunner() {
  let stdout;
  try {
    const result = await execAsync(`npx vitest run "${DEEPEVAL_DIR}" --reporter=json`, {
      cwd: REPO_ROOT,
    });
    stdout = result.stdout;
  } catch (err) {
    // vitest exits non-zero when tests fail but still writes JSON
    stdout = err.stdout ?? "";
    if (!stdout) throw err;
  }
  return stdout;
}

// ---------------------------------------------------------------------------
// Promptfoo engine (legacy — kept for transition period)
// ---------------------------------------------------------------------------

/**
 * Run the promptfoo evaluation suite.
 *
 * @param {{ configPath?: string, runner?: (configPath: string) => Promise<string> }} opts
 * @returns {Promise<BehavioralEvalResult>}
 */
async function runPromptfooEval({
  configPath = DEFAULT_PROMPTFOO_CONFIG,
  runner = defaultPromptfooRunner,
} = {}) {
  const rawOutput = await runner(configPath);

  const jsonStart = rawOutput.indexOf("{");
  if (jsonStart === -1) {
    throw new Error(
      "behavioral_eval(promptfoo): promptfoo --output json produced no JSON in stdout",
    );
  }

  let pf;
  try {
    pf = JSON.parse(rawOutput.slice(jsonStart));
  } catch (err) {
    throw new Error(`behavioral_eval(promptfoo): failed to parse promptfoo JSON: ${err.message}`);
  }

  // promptfoo v0.100+ uses results.stats; older versions use stats at top level
  const stats = pf.results?.stats ?? pf.stats;
  if (!stats) {
    throw new Error(
      "behavioral_eval(promptfoo): output missing results.stats — check promptfoo version",
    );
  }

  const passCount = stats.successes ?? 0;
  const failCount = stats.failures ?? 0;
  const totalCount = passCount + failCount;
  const passRate = totalCount > 0 ? passCount / totalCount : 0;
  const behavioralScore = Math.round(passRate * 100);

  return {
    behavioralScore,
    details: { passCount, failCount, totalCount, passRate },
    engine: "promptfoo",
  };
}

/**
 * Default promptfoo runner: spawns `npx promptfoo eval --no-progress-bar --output json`.
 *
 * @param {string} configPath
 * @returns {Promise<string>}
 */
async function defaultPromptfooRunner(configPath) {
  let stdout;
  try {
    const result = await execAsync(
      `npx promptfoo eval -c "${configPath}" --no-progress-bar --output json`,
      { cwd: REPO_ROOT },
    );
    stdout = result.stdout;
  } catch (err) {
    // promptfoo exits non-zero when some tests fail but still writes JSON
    stdout = err.stdout ?? "";
    if (!stdout) throw err;
  }
  return stdout;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] !== undefined &&
  new URL(import.meta.url).pathname.endsWith(
    process.argv[1].replace(/\\/g, "/").split("/").pop() ?? "",
  );

if (isMain || process.argv[1]?.endsWith("behavioral_eval.mjs")) {
  // Parse --engine flag from CLI args
  const engineArg = process.argv.find((a) => a.startsWith("--engine="));
  const engine = engineArg ? engineArg.split("=")[1] : "deepeval";

  if (engine !== "deepeval" && engine !== "promptfoo") {
    process.stderr.write(
      `[behavioral-eval] Unknown engine: ${engine}. Use deepeval or promptfoo.\n`,
    );
    process.exit(1);
  }

  try {
    const result = await runBehavioralEval({ engine });
    process.stdout.write(
      `[behavioral-eval] engine=${result.engine} score=${result.behavioralScore}pp ` +
        `(${result.details.passCount}/${result.details.totalCount} scenarios passed)\n`,
    );
    process.exit(result.behavioralScore > 0 ? 0 : 1);
  } catch (err) {
    process.stderr.write(`[behavioral-eval] ERROR: ${err.message}\n`);
    process.exit(1);
  }
}
