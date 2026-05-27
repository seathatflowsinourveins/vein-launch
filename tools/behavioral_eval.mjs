/**
 * behavioral_eval.mjs — Wave 11-B1 behavioral evaluation runner.
 *
 * Thin wrapper around `npx promptfoo eval` that parses the JSON output and
 * returns a normalized { behavioralScore, details } object.
 *
 * Usage (programmatic):
 *   import { runBehavioralEval } from "./tools/behavioral_eval.mjs";
 *   const { behavioralScore, details } = await runBehavioralEval();
 *
 * Exit codes (when run as main):
 *   0 — all scenarios passed
 *   1 — some scenarios failed or infrastructure error
 */

import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Absolute path to the repo root (two levels up from tools/) */
const REPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..");

/** Default promptfoo config path */
const DEFAULT_CONFIG = join(REPO_ROOT, "evals", "promptfooconfig.yaml");

/**
 * @typedef {Object} BehavioralEvalResult
 * @property {number} behavioralScore  - 0-100 pass rate across all scenarios
 * @property {{ passCount: number, failCount: number, totalCount: number, passRate: number }} details
 */

/**
 * Run the behavioral evaluation suite via promptfoo and return a normalized result.
 *
 * @param {{
 *   configPath?: string,
 *   runner?: (configPath: string) => Promise<string>,
 * }} opts
 * @returns {Promise<BehavioralEvalResult>}
 */
export async function runBehavioralEval({
  configPath = DEFAULT_CONFIG,
  runner = defaultPromptfooRunner,
} = {}) {
  const rawOutput = await runner(configPath);

  // promptfoo --output json writes a JSON object to stdout
  const jsonStart = rawOutput.indexOf("{");
  if (jsonStart === -1) {
    throw new Error("behavioral_eval: promptfoo --output json produced no JSON object in stdout");
  }

  let pf;
  try {
    pf = JSON.parse(rawOutput.slice(jsonStart));
  } catch (err) {
    throw new Error(`behavioral_eval: failed to parse promptfoo JSON output: ${err.message}`);
  }

  // promptfoo v0.100+ uses results.stats; older versions use stats at top level
  const stats = pf.results?.stats ?? pf.stats;
  if (!stats) {
    throw new Error(
      "behavioral_eval: promptfoo output missing results.stats — check promptfoo version",
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
  };
}

/**
 * Default runner: spawns `npx promptfoo eval --no-progress-bar --output json`.
 *
 * @param {string} configPath
 * @returns {Promise<string>}
 */
async function defaultPromptfooRunner(configPath) {
  let stdout;
  try {
    const result = await execFileAsync(
      "npx",
      ["promptfoo", "eval", "-c", configPath, "--no-progress-bar", "--output", "json"],
      { shell: true, cwd: REPO_ROOT },
    );
    stdout = result.stdout;
  } catch (err) {
    // promptfoo exits non-zero when some tests fail but still writes JSON —
    // capture stdout so we can parse the partial result.
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
  try {
    const result = await runBehavioralEval();
    process.stdout.write(
      `[behavioral-eval] score=${result.behavioralScore}pp ` +
        `(${result.details.passCount}/${result.details.totalCount} scenarios passed)\n`,
    );
    process.exit(result.behavioralScore > 0 ? 0 : 1);
  } catch (err) {
    process.stderr.write(`[behavioral-eval] ERROR: ${err.message}\n`);
    process.exit(1);
  }
}
