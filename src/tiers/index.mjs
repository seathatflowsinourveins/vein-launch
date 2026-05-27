/**
 * Tier registry — dynamic import by mode.
 */

export const TIERS = [
  { id: "t0-rtk", module: "./t0-rtk.mjs" },
  { id: "t1-env", module: "./t1-env.mjs" },
  { id: "t2-cliproxy", module: "./t2-cliproxy.mjs" },
  { id: "t3-cli", module: "./t3-cli.mjs" },
  { id: "t4-github", module: "./t4-github.mjs" },
  { id: "t5-drift", module: "./t5-drift.mjs" },
  { id: "t6-codegraph", module: "./t6-codegraph.mjs" },
];

export async function loadTier(id) {
  const entry = TIERS.find((t) => t.id === id);
  if (!entry) throw new Error(`Unknown tier: ${id}`);
  return import(entry.module);
}
