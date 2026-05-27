/**
 * Orchestrator — mode router + tier sequencer + result persistence + claude launch.
 * Pure function: takes args array, returns exit code. No process.argv access.
 *
 * 12-Factor Agent compliance: F5 (persist state), F8 (own control flow), F11 (CI trigger), F12 (stateless reducer).
 */

import { loadConfig } from "./lib/config.mjs";
import { launchClaude } from "./lib/exec.mjs";
import { reportJson } from "./lib/json-reporter.mjs";
import { persistResults } from "./lib/persist.mjs";
import { report } from "./lib/reporter.mjs";
import { ExitCodes, Severity, worstSeverity } from "./lib/result.mjs";
import { runTiers } from "./lib/runner.mjs";

export async function orchestrate(args) {
  // --eval-mode: emit machine-readable JSON tier results to stdout, then exit.
  // No Claude launch, no persist side-effects. Consumed by promptfoo exec provider.
  if (args.includes("--eval-mode")) {
    const evalArgs = args.filter((a) => a !== "--eval-mode");
    let evalConfig;
    try {
      evalConfig = await loadConfig(evalArgs.filter((a) => a !== "--ci"));
    } catch (err) {
      process.stdout.write(`${JSON.stringify({ error: err.message, schema: "vein-eval-v1" })}\n`);
      return ExitCodes.CONFIG_INVALID;
    }

    if (evalConfig._configError) {
      process.stdout.write(
        `${JSON.stringify({ error: evalConfig._configError, schema: "vein-eval-v1" })}\n`,
      );
      return ExitCodes.CONFIG_INVALID;
    }

    const evalRunResult = await runTiers(evalConfig);
    process.stdout.write(
      `${JSON.stringify({
        version: "1.0",
        schema: "vein-eval-v1",
        project: evalConfig.projectDir ?? null,
        mode: evalConfig.mode,
        results: evalRunResult.results.map((r) => ({
          tierId: r.tierId,
          severity: r.severity,
          durationMs: r.durationMs,
          hasEvidence: Array.isArray(r.evidence) && r.evidence.length > 0,
        })),
      })}\n`,
    );
    return ExitCodes.SUCCESS;
  }

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

  // Command-mode requests (--status, --setup, --projects, --accounts) are
  // informational only — no tier execution needed.
  if (config.args?.command) {
    return ExitCodes.SUCCESS;
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

  if (!isCi && config.projectDir) {
    const t2Result = results.find((r) => r.tierId === "t2-cliproxy");
    const cliproxyActive = t2Result?.severity === Severity.PASS;
    const launchConfig = { ...config, _cliproxyActive: cliproxyActive };
    try {
      await launchClaude(launchConfig, config.args?.passThrough ?? []);
    } catch (err) {
      console.error(`[vein] Launch failed: ${err.message}`);
      return ExitCodes.INTERNAL_ERROR;
    }
  }

  return ExitCodes.SUCCESS;
}
