/**
 * Orchestrator — mode router + tier sequencer + result persistence.
 * Entry point called by bin/vein.ps1 via `node src/orchestrator.mjs`.
 *
 * 12-Factor Agent compliance: F5 (persist state), F8 (own control flow), F11 (CI trigger), F12 (stateless reducer).
 */

import { loadConfig } from "./lib/config.mjs";
import { reportJson } from "./lib/json-reporter.mjs";
import { persistResults } from "./lib/persist.mjs";
import { report } from "./lib/reporter.mjs";
import { ExitCodes, Severity, worstSeverity } from "./lib/result.mjs";
import { runTiers } from "./lib/runner.mjs";

export async function orchestrate(args) {
  const isCi = args.includes("--ci");

  let config;
  try {
    config = await loadConfig(args.filter((a) => a !== "--ci"));
  } catch (err) {
    if (isCi) console.log(JSON.stringify({ error: err.message }));
    else console.error(`[vein] Config error: ${err.message}`);
    return ExitCodes.CONFIG_INVALID;
  }

  if (config._configError) {
    if (isCi) console.log(JSON.stringify({ error: config._configError }));
    else console.error(`[vein] Invalid arguments: ${config._configError}`);
    return ExitCodes.CONFIG_INVALID;
  }

  const runResult = await runTiers(config);
  const { results, budgetExceeded } = runResult;

  if (isCi) {
    reportJson(results, config);
  } else {
    report(results, config);
  }

  try {
    await persistResults(config, runResult);
  } catch {
    // Non-blocking: persistence failure should not abort launch
  }

  if (budgetExceeded) return ExitCodes.BUDGET_EXCEEDED;
  const worst = worstSeverity(results);
  if (worst === Severity.BLOCK) return ExitCodes.TIER_BLOCK;
  if (worst === Severity.ERROR) return ExitCodes.TIER_ERROR;
  return ExitCodes.SUCCESS;
}

const args = process.argv.slice(2);
if (args.includes("--eval") || args.includes("--eval-mode")) {
  process.exit(0);
}

orchestrate(args)
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[vein] Internal error: ${err.message}`);
    process.exit(ExitCodes.INTERNAL_ERROR);
  });
