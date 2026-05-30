/**
 * Parallel session registry — tracks active vein sessions across projects.
 * Implements 12-Factor Agent F5: "Unify execution state and business state."
 *
 * Sessions are stored as individual JSON files under ~/.vein/sessions/<uuid>.json
 * so concurrent launches from different terminals never race on a single file.
 */

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Lazily compute the sessions directory so that mocks of `node:os` take effect
 * in tests (module-level constants are evaluated before mock injection).
 * @returns {string}
 */
function getSessionsDir() {
  return join(homedir(), ".vein", "sessions");
}

/**
 * Check whether a given pid is alive on the current OS.
 * Uses `process.kill(pid, 0)` which does not send a signal —
 * it only tests whether the process exists and is reachable.
 *
 * @param {number} pid
 * @returns {boolean}
 */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a new session entry and persist it to disk.
 *
 * @param {{ project: string, mode: string }} opts
 * @returns {Promise<{ id: string, project: string, pid: number, startedAt: string, mode: string, status: string }>}
 */
export async function createSession({ project, mode }) {
  const sessionsDir = getSessionsDir();
  if (!existsSync(sessionsDir)) {
    await mkdir(sessionsDir, { recursive: true });
  }

  const session = {
    id: randomUUID(),
    project,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    mode,
    status: "active",
  };

  const filePath = join(sessionsDir, `${session.id}.json`);
  await writeFile(filePath, JSON.stringify(session, null, 2));
  return session;
}

/**
 * Read all session files, filter to those whose pid is still alive.
 *
 * @returns {Promise<Array<{ id: string, project: string, pid: number, startedAt: string, mode: string, status: string }>>}
 */
export async function listSessions() {
  const sessionsDir = getSessionsDir();
  if (!existsSync(sessionsDir)) return [];

  const files = await readdir(sessionsDir);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const sessions = [];
  for (const file of jsonFiles) {
    let data;
    try {
      const raw = await readFile(join(sessionsDir, file), "utf-8");
      data = JSON.parse(raw);
    } catch {
      // Corrupt or non-JSON file — skip silently
      continue;
    }
    if (isPidAlive(data.pid)) {
      sessions.push(data);
    }
  }
  return sessions;
}

/**
 * Remove session files whose recorded pid is no longer alive.
 *
 * @returns {Promise<void>}
 */
export async function cleanSessions() {
  const sessionsDir = getSessionsDir();
  if (!existsSync(sessionsDir)) return;

  const files = await readdir(sessionsDir);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  for (const file of jsonFiles) {
    let data;
    try {
      const raw = await readFile(join(sessionsDir, file), "utf-8");
      data = JSON.parse(raw);
    } catch {
      // Corrupt file — leave it; do not silently nuke unknown content
      continue;
    }
    if (!isPidAlive(data.pid)) {
      try {
        await unlink(join(sessionsDir, file));
      } catch {
        // Race condition: another process already cleaned it — fine
      }
    }
  }
}

/**
 * Shorthand for the count of currently active (alive-pid) sessions.
 *
 * @returns {Promise<number>}
 */
export async function getSessionCount() {
  const sessions = await listSessions();
  return sessions.length;
}
