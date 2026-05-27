/**
 * Claude launcher — builds env vars and spawns claude process.
 */

import { execSync } from "node:child_process";

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

export function buildLaunchArgs(config, passThrough) {
  const args = ["--dangerously-skip-permissions"];
  if (passThrough?.length) args.push(...passThrough);
  return args;
}

export function launchClaude(config, passThrough) {
  const env = { ...process.env, ...buildLaunchEnv(config) };
  const args = buildLaunchArgs(config, passThrough);
  const command = ["claude", ...args].join(" ");

  execSync(command, {
    cwd: config.projectDir,
    env,
    stdio: "inherit",
    windowsHide: false,
  });
}
