/**
 * Setup wizard orchestrator — runs all setup steps in sequence.
 */

import setupCliproxy from "./cliproxy.mjs";
import setupGitConfig from "./git-config.mjs";
import setupGithubRulesets from "./github-rulesets.mjs";
import setupRtk from "./rtk.mjs";
import setupTools from "./tools.mjs";

async function detectOs(_options) {
  const platform = process.platform;
  const isWsl = process.env.WSL_DISTRO_NAME != null;
  return { ok: true, message: `${platform}${isWsl ? " (WSL)" : ""}` };
}

const STEPS = [
  { name: "os-detect", fn: detectOs },
  { name: "rtk", fn: setupRtk },
  { name: "tools", fn: setupTools },
  { name: "git-config", fn: setupGitConfig },
  { name: "cliproxy", fn: setupCliproxy },
  { name: "github-rulesets", fn: setupGithubRulesets },
];

export async function runSetupWizard(options = {}) {
  const { dryRun = false, steps = STEPS.map((s) => s.name) } = options;
  const results = [];
  for (const step of STEPS) {
    if (!steps.includes(step.name)) continue;
    try {
      const result = dryRun ? { ok: true, message: "[dry-run] skipped" } : await step.fn(options);
      results.push({ name: step.name, ...result });
    } catch (err) {
      results.push({ name: step.name, ok: false, message: err.message });
    }
  }
  return { ok: results.every((r) => r.ok), results };
}
