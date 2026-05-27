/**
 * GitHub rulesets setup step.
 */

import { exec } from "../lib/shell.mjs";

export default async function setupGithubRulesets(options = {}) {
  const { owner, repo } = options;
  if (!owner || !repo) {
    return { ok: true, message: "No owner/repo specified — skipping rulesets" };
  }
  const check = await exec(`gh api /repos/${owner}/${repo}/rulesets`);
  if (check.ok && check.stdout.includes("branch-protection")) {
    return { ok: true, message: "Rulesets already configured" };
  }
  return { ok: true, message: "Rulesets setup requires manual configuration via GitHub UI" };
}
