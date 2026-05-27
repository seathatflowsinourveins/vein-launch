/**
 * PM2 CLIProxy provider.
 * Manages the "cliproxy" process through the PM2 process manager.
 *
 * Uses execArgs (array form) rather than exec (string form) so that
 * binary paths containing spaces — e.g. `C:\Program Files\...\cliproxy.exe`
 * — are passed as a single argument instead of being whitespace-split.
 */

import { execArgs } from "../lib/shell.mjs";

const PROCESS_NAME = "cliproxy";

/**
 * @typedef {{ running: boolean, pid: number|null, details: string }} StatusResult
 * @typedef {{ ok: boolean, message: string }} ActionResult
 * @typedef {{ stdout: string, stderr: string }} LogsResult
 */

/**
 * Returns the current status of the cliproxy PM2 process.
 * @returns {Promise<StatusResult>}
 */
export async function status() {
  const result = await execArgs("pm2", ["describe", PROCESS_NAME, "--json"]);

  if (!result.ok) {
    return { running: false, pid: null, details: "not found" };
  }

  const processes = parseJson(result.stdout);
  if (!processes || processes.length === 0) {
    return { running: false, pid: null, details: "not found" };
  }

  const proc = processes[0];
  const pmStatus = proc.pm2_env?.status ?? "unknown";

  if (pmStatus === "online") {
    return { running: true, pid: proc.pid ?? null, details: "online" };
  }

  return { running: false, pid: null, details: pmStatus };
}

/**
 * Starts cliproxy via PM2 using the given binary path.
 * @param {string} binaryPath
 * @returns {Promise<ActionResult>}
 */
export async function start(binaryPath) {
  const result = await execArgs("pm2", ["start", binaryPath, "--name", PROCESS_NAME]);
  return { ok: result.ok, message: result.ok ? "started" : result.stderr };
}

/**
 * Stops the cliproxy PM2 process.
 * @returns {Promise<ActionResult>}
 */
export async function stop() {
  const result = await execArgs("pm2", ["stop", PROCESS_NAME]);
  return { ok: result.ok, message: result.ok ? "stopped" : result.stderr };
}

/**
 * Restarts the cliproxy PM2 process.
 * @returns {Promise<ActionResult>}
 */
export async function restart() {
  const result = await execArgs("pm2", ["restart", PROCESS_NAME]);
  return { ok: result.ok, message: result.ok ? "restarted" : result.stderr };
}

/**
 * Fetches PM2 logs for cliproxy.
 * @param {number} lines - Number of log lines to retrieve (default 50).
 * @returns {Promise<LogsResult>}
 */
export async function logs(lines = 50) {
  const result = await execArgs("pm2", [
    "logs",
    PROCESS_NAME,
    "--nostream",
    "--lines",
    String(lines),
  ]);
  return { stdout: result.stdout, stderr: result.stderr };
}

/**
 * Safely parses a JSON string, returning null on failure.
 * @param {string} raw
 * @returns {unknown[]|null}
 */
function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
