/**
 * Git configuration setup step.
 */

import { exec } from "../lib/shell.mjs";

const GIT_COMMANDS = [
  "git config --global core.autocrlf input",
  "git config --global gpg.format ssh",
  "git config --global commit.gpgsign true",
  "git config --global init.defaultBranch main",
];

export default async function setupGitConfig() {
  const results = [];
  for (const cmd of GIT_COMMANDS) {
    const r = await exec(cmd);
    results.push({ cmd, ok: r.ok });
  }
  const allOk = results.every((r) => r.ok);
  return {
    ok: allOk,
    message: allOk ? "Git configured" : "Some git config commands failed",
  };
}
