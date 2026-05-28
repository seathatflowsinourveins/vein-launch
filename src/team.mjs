/**
 * Agent Team Config writer for vein-launch.
 * Generates Claude Code agent team configuration files from .vein.json `agents` section.
 * Writes team config to ~/.claude/teams/{name}/config.json and creates a shared task directory.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * @typedef {{ model: string, instructions: string }} LeadConfig
 * @typedef {{ name: string, model: string, instructions: string, isolation?: string }} TeammateConfig
 * @typedef {{ name: string, lead: LeadConfig, teammates: TeammateConfig[], taskDir: string, createdAt: string, isolation?: string }} TeamConfig
 */

const DEFAULT_LEAD = { model: "opus", instructions: "Coordinate the team" };
const SAFE_TEAM_NAME_RE = /^[a-zA-Z0-9_-]{1,100}$/;

function validateTeamName(name) {
  if (!SAFE_TEAM_NAME_RE.test(name)) {
    throw new Error(
      `Invalid team name: ${name} — must be alphanumeric/hyphen/underscore, 1-100 chars`,
    );
  }
}

/**
 * Generate a TeamConfig from a vein.json config object.
 * @param {object} config
 * @returns {TeamConfig | null}
 */
export function generateTeamConfig(config) {
  const agents = config?.agents;
  if (!agents?.teamName) return null;
  validateTeamName(agents.teamName);

  const teamDir = join(homedir(), ".claude", "teams", agents.teamName);
  const taskDir = join(teamDir, "tasks");

  const teamConfig = {
    name: agents.teamName,
    lead: agents.lead ?? DEFAULT_LEAD,
    teammates: agents.teammates ?? [],
    taskDir,
    createdAt: new Date().toISOString(),
  };

  if (agents.isolation) {
    teamConfig.isolation = agents.isolation;
  }

  return teamConfig;
}

/**
 * Write a TeamConfig to disk, creating directories as needed.
 * @param {TeamConfig | null | undefined} teamConfig
 * @returns {{ ok: boolean, message: string }}
 */
export function writeTeamConfig(teamConfig) {
  if (!teamConfig?.name) return { ok: false, message: "invalid team config" };
  validateTeamName(teamConfig.name);

  const teamDir = join(homedir(), ".claude", "teams", teamConfig.name);
  const configPath = join(teamDir, "config.json");

  try {
    mkdirSync(teamConfig.taskDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(teamConfig, null, 2));
    return { ok: true, message: `Team config written to ${configPath}` };
  } catch (err) {
    return { ok: false, message: `Failed to write team config: ${err.message}` };
  }
}

/**
 * Load a TeamConfig from disk by team name.
 * @param {string} teamName
 * @returns {TeamConfig | null}
 */
export function loadTeamConfig(teamName) {
  validateTeamName(teamName);
  const configPath = join(homedir(), ".claude", "teams", teamName, "config.json");
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}
