/**
 * Unleash phase auto-gate logic.
 *
 * "bypass" requires proof of at least one successful deep precheck run with no
 * fatal severities recorded in runsDir. Fatal severities are "block" and "error".
 * Non-fatal severities (pass, info, warn, skip) are considered operable and do
 * not disqualify a run. If no qualifying run is found, the phase is downgraded
 * to "allow-populated" so the user still gets skip-permissions but must have a
 * curated allow-list in .claude/settings.json.
 */

/**
 * Allow-list of severities that count as operable for the bypass auto-gate.
 *
 * Deliberately an allow-list (not a deny-list of fatal severities) so that
 * malformed or missing severity values fail closed. With a deny-list,
 * `String(null).toLowerCase()` would yield "null" — not in the fatal set,
 * so a tier with a missing severity would silently pass.
 */
const OPERABLE_SEVERITIES = new Set(["pass", "info", "warn", "skip"]);

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * @param {{
 *   configPhase: "default"|"allow-populated"|"bypass",
 *   runsDir: string,
 *   project?: string,
 * }} args
 * @returns {Promise<{ phase: "default"|"allow-populated"|"bypass", downgraded: boolean, reason?: string }>}
 */
export async function resolveUnleashPhase({ configPhase, runsDir, project }) {
  if (configPhase !== "bypass") return { phase: configPhase, downgraded: false };
  const hasQualifyingRun = await checkQualifyingRun(runsDir, project);
  if (hasQualifyingRun) return { phase: "bypass", downgraded: false };
  return {
    phase: "allow-populated",
    downgraded: true,
    reason:
      "bypass requires at least one deep run with no fatal severities for this project; downgrading to allow-populated",
  };
}

async function checkQualifyingRun(runsDir, project) {
  try {
    const entries = await readdir(runsDir);
    for (const name of entries) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(runsDir, name), "utf8");
        const run = JSON.parse(raw);
        // Project filter: only when caller provides a project AND run records its own project.
        if (project && run.project && run.project !== project) continue;
        // Mode filter: if the run records a mode, require deep (legacy runs without mode are accepted).
        if (run.mode !== undefined && run.mode !== "deep") continue;
        // Field name: accept `tiers` (production persist format) or `results` (test fixture format).
        const tiers = Array.isArray(run.tiers)
          ? run.tiers
          : Array.isArray(run.results)
            ? run.results
            : null;
        if (
          tiers &&
          tiers.length >= 7 &&
          tiers.every((r) => OPERABLE_SEVERITIES.has(String(r?.severity ?? "").toLowerCase()))
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
