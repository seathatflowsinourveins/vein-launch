/**
 * Tier runner — executes tier sequence within mode budget.
 */

import { evaluateBlockRules } from "./block-engine.mjs";
import { createResult, Severity } from "./result.mjs";

const TIER_MODULES = {
  "t0-rtk": "../tiers/t0-rtk.mjs",
  "t1-env": "../tiers/t1-env.mjs",
  "t2-cliproxy": "../tiers/t2-cliproxy.mjs",
  "t3-cli": "../tiers/t3-cli.mjs",
  "t4-github": "../tiers/t4-github.mjs",
  "t5-drift": "../tiers/t5-drift.mjs",
  "t6-codegraph": "../tiers/t6-codegraph.mjs",
};

export async function runTiers(config) {
  const modeConfig = config.modes?.[config.mode];
  if (!modeConfig) throw new Error(`Unknown mode: ${config.mode}`);

  const isRepair = config.mode === "repair";
  const budget = modeConfig.budget;
  const tierIds = modeConfig.tiers;
  const results = [];
  let elapsed = 0;
  let budgetExceeded = false;

  for (const tierId of tierIds) {
    if (elapsed >= budget) {
      budgetExceeded = true;
      results.push(
        createResult({
          tierId,
          tierName: tierId,
          severity: Severity.SKIP,
          evidence: [
            { check: "budget", actual: `${Math.round(elapsed)}ms elapsed, ${budget}ms budget` },
          ],
          durationMs: 0,
        }),
      );
      continue;
    }

    const tierBudget = budget - elapsed;
    const start = performance.now();
    try {
      const mod = await import(TIER_MODULES[tierId]);
      const result = await runWithTimeout(
        () => mod.check(config, { budget: tierBudget, mode: config.mode }),
        tierBudget,
        tierId,
      );
      results.push(result);

      if (isRepair && result.severity === Severity.BLOCK && mod.repair) {
        const repairStart = performance.now();
        const remainingBudget = budget - elapsed - (performance.now() - start);
        if (remainingBudget > 0) {
          const repairResult = await runWithTimeout(
            () => mod.repair(config, { budget: remainingBudget, mode: config.mode }),
            remainingBudget,
            tierId,
          );
          results.push(repairResult);
        }
        elapsed += performance.now() - repairStart;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push(
        createResult({
          tierId,
          tierName: tierId,
          severity: Severity.ERROR,
          evidence: [{ check: tierId, actual: errMsg, remediation: "Check tier implementation" }],
          durationMs: performance.now() - start,
          diagnostics: err instanceof Error ? { stack: err.stack } : undefined,
        }),
      );
    }
    elapsed += performance.now() - start;
  }

  const triggeredRules = evaluateBlockRules(results);
  return { results, budgetExceeded, elapsed: Math.round(elapsed), triggeredRules };
}

async function runWithTimeout(fn, budgetMs, tierId) {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Tier ${tierId} exceeded ${budgetMs}ms budget`)), budgetMs),
    ),
  ]);
}
