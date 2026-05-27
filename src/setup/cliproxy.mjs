/**
 * CLIProxy setup step (Docker or PM2 hosting).
 */

import { exec } from "../lib/shell.mjs";

export default async function setupCliproxy(options = {}) {
  const { hosting = "pm2" } = options;
  if (hosting === "docker") {
    const result = await exec("wsl docker compose -f ~/docker/cliproxy/compose.yml up -d", {
      timeout: 30000,
    });
    return {
      ok: result.ok,
      message: result.ok ? "CLIProxy started via Docker" : result.stderr,
    };
  }
  const result = await exec("pm2 start cli-proxy-api --name cliproxy", { timeout: 15000 });
  return {
    ok: result.ok,
    message: result.ok ? "CLIProxy started via PM2" : result.stderr,
  };
}
