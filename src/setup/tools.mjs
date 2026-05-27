/**
 * mise tool installation setup step.
 */

import { exec } from "../lib/shell.mjs";

export default async function setupTools() {
  const miseCheck = await exec("mise --version");
  if (!miseCheck.ok) {
    return { ok: false, message: "mise not installed. Visit https://mise.jdx.dev" };
  }
  const result = await exec("mise install", { timeout: 120000 });
  return {
    ok: result.ok,
    message: result.ok ? "All tools installed via mise" : result.stderr,
  };
}
