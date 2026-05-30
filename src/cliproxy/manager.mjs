/**
 * CLIProxy Manager Orchestrator.
 * Delegates lifecycle operations to the configured PM2 or Docker provider.
 */

import * as docker from "./docker.mjs";
import * as pm2 from "./pm2.mjs";

/**
 * @typedef {{ hosting: string, running: boolean, details: string }} StatusResult
 * @typedef {{ ok: boolean, message: string }} ActionResult
 * @typedef {{ ok: boolean, wasStarted: boolean, message: string }} EnsureResult
 * @typedef {{ stdout: string, stderr: string }} LogsResult
 */

/**
 * Resolves the correct provider based on config.cliproxy.hosting.
 * @param {object} config
 * @returns {object|null}
 */
function getProvider(config) {
  const hosting = config?.cliproxy?.hosting;
  if (hosting === "pm2") return pm2;
  if (hosting === "docker") return docker;
  return null;
}

/**
 * Returns the current status of the configured CLIProxy provider.
 * @param {object} config
 * @returns {Promise<StatusResult>}
 */
export async function getStatus(config) {
  const provider = getProvider(config);
  if (!provider) return { hosting: "none", running: false, details: "CLIProxy not configured" };
  const result = await provider.status();
  return { hosting: config.cliproxy.hosting, ...result };
}

/**
 * Starts the CLIProxy using the configured provider.
 * @param {object} config
 * @returns {Promise<ActionResult>}
 */
export async function startProxy(config) {
  const provider = getProvider(config);
  if (!provider) return { ok: false, message: "CLIProxy not configured" };
  if (config.cliproxy.hosting === "pm2") {
    const binaryPath = config.cliproxy.binaryPath ?? "cli-proxy-api";
    return provider.start(binaryPath, { cwd: config.cliproxy.cwd });
  }
  return provider.start();
}

/**
 * Stops the CLIProxy using the configured provider.
 * @param {object} config
 * @returns {Promise<ActionResult>}
 */
export async function stopProxy(config) {
  const provider = getProvider(config);
  if (!provider) return { ok: false, message: "CLIProxy not configured" };
  return provider.stop();
}

/**
 * Restarts the CLIProxy using the configured provider.
 * @param {object} config
 * @returns {Promise<ActionResult>}
 */
export async function restartProxy(config) {
  const provider = getProvider(config);
  if (!provider) return { ok: false, message: "CLIProxy not configured" };
  return provider.restart();
}

/**
 * Returns logs from the CLIProxy using the configured provider.
 * @param {object} config
 * @param {number} [lines=50]
 * @returns {Promise<LogsResult>}
 */
export async function getProxyLogs(config, lines = 50) {
  const provider = getProvider(config);
  if (!provider) return { stdout: "", stderr: "CLIProxy not configured" };
  return provider.logs(lines);
}

/**
 * Ensures the CLIProxy is running, starting it if necessary.
 * @param {object} config
 * @returns {Promise<EnsureResult>}
 */
export async function ensureRunning(config) {
  const provider = getProvider(config);
  if (!provider) return { ok: false, wasStarted: false, message: "CLIProxy not configured" };
  const currentStatus = await provider.status();
  if (currentStatus.running) return { ok: true, wasStarted: false, message: "already running" };
  const startResult = await startProxy(config);
  return { ok: startResult.ok, wasStarted: true, message: startResult.message };
}
