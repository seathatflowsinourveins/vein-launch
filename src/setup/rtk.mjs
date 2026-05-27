/**
 * RTK installation setup step.
 */

import { exec } from "../lib/shell.mjs";

const IS_WINDOWS = process.platform === "win32";

export default async function setupRtk() {
  const check = await exec("rtk --version");
  if (check.ok) {
    return { ok: true, message: `RTK already installed: ${check.stdout.trim()}` };
  }
  const cmd = IS_WINDOWS
    ? 'powershell -c "Invoke-WebRequest -Uri https://github.com/rtk-ai/rtk/releases/latest/download/rtk-x86_64-pc-windows-msvc.zip -OutFile $env:TEMP/rtk.zip; Expand-Archive $env:TEMP/rtk.zip -DestinationPath $HOME/bin -Force"'
    : "curl -fsSL https://rtk-ai.app/install.sh | sh";
  const result = await exec(cmd, { timeout: 60000 });
  return {
    ok: result.ok,
    message: result.ok ? "RTK installed" : `Install failed: ${result.stderr}`,
  };
}
