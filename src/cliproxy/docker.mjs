/**
 * Docker provider for CLIProxy lifecycle management.
 * Manages the cliproxy container via wsl docker compose.
 */

import { exec } from "../lib/shell.mjs";

const COMPOSE_FILE = "~/docker/cliproxy/compose.yml";
const COMPOSE_CMD = `wsl docker compose -f ${COMPOSE_FILE}`;

/**
 * @typedef {{ running: boolean, details: string }} StatusResult
 * @typedef {{ ok: boolean, message: string }} ActionResult
 * @typedef {{ stdout: string, stderr: string }} LogsResult
 */

/**
 * Returns the running state of the cliproxy container.
 * @returns {Promise<StatusResult>}
 */
export async function status() {
  const result = await exec(`${COMPOSE_CMD} ps --format json`);

  if (!result.ok) {
    return { running: false, details: "docker not available or compose file missing" };
  }

  let services;
  try {
    services = JSON.parse(result.stdout);
  } catch (err) {
    // Distinguish parse failure from "docker not available" so debugging is precise.
    return { running: false, details: `docker compose returned non-JSON output: ${err.message}` };
  }

  if (!Array.isArray(services) || services.length === 0) {
    return { running: false, details: "no services found" };
  }

  const running = services.some((s) => s.State === "running");
  if (running) {
    return { running: true, details: "container running" };
  }

  const state = services[0]?.State ?? "unknown";
  return { running: false, details: state };
}

/**
 * Starts the cliproxy container in detached mode.
 * @returns {Promise<ActionResult>}
 */
export async function start() {
  const result = await exec(`${COMPOSE_CMD} up -d`);
  return {
    ok: result.ok,
    message: result.ok ? "cliproxy started" : result.stderr || "start failed",
  };
}

/**
 * Stops the cliproxy container.
 * @returns {Promise<ActionResult>}
 */
export async function stop() {
  const result = await exec(`${COMPOSE_CMD} down`);
  return {
    ok: result.ok,
    message: result.ok ? "cliproxy stopped" : result.stderr || "stop failed",
  };
}

/**
 * Restarts the cliproxy container.
 * @returns {Promise<ActionResult>}
 */
export async function restart() {
  const result = await exec(`${COMPOSE_CMD} restart`);
  return {
    ok: result.ok,
    message: result.ok ? "cliproxy restarted" : result.stderr || "restart failed",
  };
}

/**
 * Fetches recent log lines from the cliproxy container.
 * @param {number} [lines=50] - Number of tail lines (clamped to 1..10000).
 * @returns {Promise<LogsResult>}
 */
export async function logs(lines = 50) {
  const n = Number(lines);
  const safe = Number.isInteger(n) && n >= 1 && n <= 10000 ? n : 50;
  const result = await exec(`${COMPOSE_CMD} logs --tail ${safe}`);
  return { stdout: result.stdout, stderr: result.stderr };
}
