/**
 * Tier result persistence — stores run results for cross-session trend analysis.
 * Implements 12-Factor Agent F5: "Unify execution state and business state."
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const STATE_DIR = join(homedir(), ".vein", "runs");

export async function persistResults(config, runResult) {
  if (!existsSync(STATE_DIR)) {
    await mkdir(STATE_DIR, { recursive: true });
  }

  const entry = {
    timestamp: new Date().toISOString(),
    project: config.args?.project ?? "unknown",
    mode: config.mode,
    elapsed: runResult.elapsed,
    budgetExceeded: runResult.budgetExceeded,
    tiers: runResult.results.map((r) => ({
      tierId: r.tierId,
      severity: r.severity,
      durationMs: r.durationMs,
      evidenceCount: r.evidence.length,
    })),
  };

  const filename = `${entry.timestamp.replace(/[:.]/g, "-")}_${entry.project}_${entry.mode}.json`;
  await writeFile(join(STATE_DIR, filename), JSON.stringify(entry, null, 2));
  return entry;
}

export async function getRecentRuns(project, limit = 10) {
  if (!existsSync(STATE_DIR)) return [];
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(STATE_DIR);
  const matching = files
    .filter((f) => f.includes(project) && f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit);

  const runs = [];
  for (const f of matching) {
    const data = JSON.parse(await readFile(join(STATE_DIR, f), "utf-8"));
    runs.push(data);
  }
  return runs;
}

export function detectTrend(runs, tierId) {
  const severities = runs
    .map((r) => r.tiers.find((t) => t.tierId === tierId)?.severity)
    .filter(Boolean);
  const warnCount = severities.filter((s) => s === "warn" || s === "block").length;
  if (warnCount >= 3)
    return {
      tierId,
      trend: "degrading",
      warnCount,
      message: `${tierId} has been warn/block for ${warnCount} consecutive runs`,
    };
  return null;
}
