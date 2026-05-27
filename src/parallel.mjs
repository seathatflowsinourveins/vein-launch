/**
 * Parallel Session Spawner — opens multiple Claude Code sessions in Windows Terminal tabs.
 */

import { exec } from "./lib/shell.mjs";

/**
 * @typedef {{ name: string, cwd: string, args?: string[], worktree?: boolean }} Session
 * @typedef {{ name: string, ok: boolean, message: string }} SessionResult
 * @typedef {{ spawned: number, failed: number, sessions: SessionResult[] }} SpawnResult
 */

const SAFE_NAME_RE = /^[a-zA-Z0-9_-]{1,100}$/;

function sanitizeForShell(value) {
  return value.replace(/["%$`\\!]/g, "");
}

/**
 * Build a `wt` command that opens a new tab for the given session.
 * @param {Session} session
 * @returns {string}
 */
export function buildWtCommand(session) {
  if (!SAFE_NAME_RE.test(session.name)) {
    throw new Error(
      `Invalid session name: ${session.name} — must be alphanumeric/hyphen/underscore, 1-100 chars`,
    );
  }
  const safeCwd = sanitizeForShell(session.cwd);
  const args = session.args ?? ["--dangerously-skip-permissions"];
  const safeArgs = args.map(sanitizeForShell);
  const claudeCmd = `claude ${safeArgs.join(" ")}`;
  return `wt -w 0 new-tab --title "${session.name}" -d "${safeCwd}" ${claudeCmd}`;
}

/**
 * Spawn one Windows Terminal tab per session.
 * @param {Session[]} sessions
 * @param {{ dryRun?: boolean }} options
 * @returns {Promise<SpawnResult>}
 */
export async function spawnSessions(sessions, options = {}) {
  const { dryRun = false } = options;
  const results = [];

  for (const session of sessions) {
    const cmd = buildWtCommand(session);
    if (dryRun) {
      results.push({ name: session.name, ok: true, message: `[dry-run] ${cmd}` });
      continue;
    }
    const result = await exec(cmd);
    results.push({
      name: session.name,
      ok: result.ok,
      message: result.ok ? "spawned" : result.stderr || "spawn failed",
    });
  }

  return {
    spawned: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    sessions: results,
  };
}

/**
 * Spawn sessions declared in a `.vein.json`-style config object.
 * @param {{ parallel?: { sessions?: Session[] } }} config
 * @returns {Promise<SpawnResult>}
 */
export async function spawnFromConfig(config) {
  if (!config.parallel?.sessions?.length) {
    return { spawned: 0, failed: 0, sessions: [] };
  }
  return spawnSessions(config.parallel.sessions);
}
