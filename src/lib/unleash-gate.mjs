/**
 * Unleash phase auto-gate logic.
 *
 * "bypass" requires proof of at least one successful all-tiers-PASS precheck
 * run recorded in runsDir. If no qualifying run is found, the phase is
 * downgraded to "allow-populated" so the user still gets skip-permissions but
 * must have a curated allow-list in .claude/settings.json.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * @param {{ configPhase: "default"|"allow-populated"|"bypass", runsDir: string }} args
 * @returns {Promise<{ phase: "default"|"allow-populated"|"bypass", downgraded: boolean, reason?: string }>}
 */
export async function resolveUnleashPhase({ configPhase, runsDir }) {
  if (configPhase !== "bypass") return { phase: configPhase, downgraded: false };
  const hasQualifyingRun = await checkQualifyingRun(runsDir);
  if (hasQualifyingRun) return { phase: "bypass", downgraded: false };
  return {
    phase: "allow-populated",
    downgraded: true,
    reason: "bypass requires at least one all-tiers-PASS run; downgrading to allow-populated",
  };
}

async function checkQualifyingRun(runsDir) {
  try {
    const entries = await readdir(runsDir);
    for (const name of entries) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(runsDir, name), "utf8");
        const run = JSON.parse(raw);
        if (
          Array.isArray(run.results) &&
          run.results.length >= 7 &&
          run.results.every((r) => r.severity === "PASS")
        ) {
          return true;
        }
      } catch {
        /* skip malformed */
      }
    }
  } catch {
    /* runsDir doesn't exist */
  }
  return false;
}
