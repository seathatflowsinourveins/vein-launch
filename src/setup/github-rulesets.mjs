/**
 * GitHub rulesets setup step.
 *
 * Security: owner and repo are validated against SAFE_SLUG_RE before use.
 * The gh api call uses execArgs (shell:false) to prevent shell injection from
 * caller-controlled owner/repo values embedded in the URL path argument.
 */

import { execArgs } from "../lib/shell.mjs";

/**
 * Allowlist for GitHub owner/repo slugs.
 * GitHub itself restricts to [a-zA-Z0-9._-] — no slashes, no spaces, no shell metacharacters.
 * We match that exactly: no path separators so `../etc` style traversal is rejected at this level
 * (though execArgs shell:false would already prevent shell-level injection).
 */
const SAFE_SLUG_RE = /^[a-zA-Z0-9._-]{1,100}$/;

export default async function setupGithubRulesets(options = {}) {
  const { owner, repo } = options;
  if (!owner || !repo) {
    return { ok: true, message: "No owner/repo specified — skipping rulesets" };
  }
  if (!SAFE_SLUG_RE.test(owner) || !SAFE_SLUG_RE.test(repo)) {
    return { ok: false, message: "Invalid owner or repo name" };
  }

  // Pass the API path as a discrete argument — owner/repo are already validated,
  // and execArgs uses shell:false so the interpolated string is never shell-parsed.
  const check = await execArgs("gh", ["api", `/repos/${owner}/${repo}/rulesets`]);

  if (check.ok && check.stdout.includes("branch-protection")) {
    return { ok: true, message: "Rulesets already configured" };
  }
  return { ok: true, message: "Rulesets setup requires manual configuration via GitHub UI" };
}
