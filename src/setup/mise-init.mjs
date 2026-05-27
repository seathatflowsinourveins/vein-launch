/**
 * mise initialization setup step.
 */

import { exec } from "../lib/shell.mjs";

const IS_WINDOWS = process.platform === "win32";

export default async function setupMiseInit() {
  const check = await exec("mise --version");
  if (check.ok) {
    return { ok: true, message: `mise already available: ${check.stdout.trim()}` };
  }
  const cmd = IS_WINDOWS
    ? 'powershell -c "irm https://mise.jdx.dev/install.ps1 | iex"'
    : "curl -fsSL https://mise.run | sh";
  const result = await exec(cmd, { timeout: 60000 });
  return {
    ok: result.ok,
    message: result.ok ? "mise installed" : result.stderr,
  };
}
