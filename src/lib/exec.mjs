/**
 * Claude launcher — builds env vars and spawns claude process.
 */

import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveUnleashPhase } from "./unleash-gate.mjs";

export function buildLaunchEnv(config) {
  const env = {};

  if (config._cliproxyActive) {
    const port = config.cliproxy?.port ?? 8317;
    env.ANTHROPIC_BASE_URL = `http://localhost:${port}`;
    env.ENABLE_TOOL_SEARCH = "true";
  }

  if (config.modelRouting?.subagents) {
    env.CLAUDE_CODE_SUBAGENT_MODEL = config.modelRouting.subagents;
  }

  env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
  env.CLAUDE_CODE_EFFORT_LEVEL = "max";
  env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = "80";

  if (config.quality?.codexReview === "every-stop") {
    env.CODEX_STOP_REVIEW = "1";
  }

  env.VEIN_LAUNCHED = "1";
  env.VEIN_PROJECT = config.project ?? "";

  if (config.env) {
    Object.assign(env, config.env);
  }

  return env;
}

/**
 * Check whether .claude/settings.json in projectDir has a non-empty
 * permissions.allow array. Used to warn when phase=allow-populated.
 *
 * @param {string} projectDir
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function checkAllowList(projectDir) {
  const settingsPath = join(projectDir, ".claude", "settings.json");
  let settings;
  try {
    const raw = await readFile(settingsPath, "utf8");
    settings = JSON.parse(raw);
  } catch {
    return { ok: false, reason: `settings.json not found at ${settingsPath}` };
  }
  const allow = settings?.permissions?.allow;
  if (!Array.isArray(allow) || allow.length === 0) {
    return { ok: false, reason: "permissions.allow is missing or empty in .claude/settings.json" };
  }
  return { ok: true };
}

/**
 * Synchronous version — legacy baseline (buildLaunchArgs always adds --dangerously-skip-permissions).
 * Kept so existing sync tests continue to pass.
 *
 * @deprecated Use buildLaunchArgsAsync for phase-aware behavior.
 */
export function buildLaunchArgs(_config, passThrough) {
  const args = ["--dangerously-skip-permissions"];
  if (passThrough?.length) args.push(...passThrough);
  return args;
}

/**
 * Async, phase-aware version of buildLaunchArgs.
 *
 * @param {object} config
 * @param {string[]} passThrough
 * @param {{ runsDir?: string }} [opts]  — override runsDir for testability
 * @returns {Promise<string[]>}
 */
export async function buildLaunchArgsAsync(config, passThrough, opts = {}) {
  const runsDir = opts.runsDir ?? join(homedir(), ".vein", "runs");
  const { phase, downgraded, reason } = await resolveUnleashPhase({
    configPhase: config.unleashPhase ?? "default",
    runsDir,
  });

  if (downgraded) {
    process.stderr.write(`[vein] WARN: ${reason}\n`);
  }

  const args = [];

  if (phase !== "default") {
    args.push("--dangerously-skip-permissions");
  }

  if (phase === "allow-populated") {
    const projectDir = config.projectDir ?? process.cwd();
    const { ok, reason: allowReason } = await checkAllowList(projectDir);
    if (!ok) {
      process.stderr.write(
        `[vein] WARN: allow-populated phase active but allow-list check failed: ${allowReason}\n`,
      );
    }
  }

  if (passThrough?.length) args.push(...passThrough);
  return args;
}

export async function launchClaude(config, passThrough) {
  const env = { ...process.env, ...buildLaunchEnv(config) };
  const args = await buildLaunchArgsAsync(config, passThrough);
  const command = ["claude", ...args].join(" ");

  execSync(command, {
    cwd: config.projectDir,
    env,
    stdio: "inherit",
    windowsHide: false,
  });
}
