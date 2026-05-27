/**
 * Project Registry — manages ~/.vein/projects.json for alias-based project resolution.
 *
 * `vein trading` resolves "trading" to its registered absolute path.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SAFE_NAME_RE = /^[a-zA-Z0-9_-]{1,100}$/;

function projectsPath() {
  return join(homedir(), ".vein", "projects.json");
}

function loadRegistry() {
  const path = projectsPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function saveRegistry(registry) {
  const dir = join(homedir(), ".vein");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(projectsPath(), JSON.stringify(registry, null, 2));
}

/** @returns {string} Absolute path to the projects registry file */
export function getProjectsPath() {
  return projectsPath();
}

/** @returns {Record<string, string>} All registered project aliases */
export function listProjects() {
  return loadRegistry();
}

/**
 * Register a project alias.
 * @param {string} name - Alias (alphanumeric, hyphens, underscores; 1-100 chars)
 * @param {string} projectPath - Absolute path to register
 * @returns {{ ok: boolean, message: string }}
 */
export function addProject(name, projectPath) {
  if (!SAFE_NAME_RE.test(name)) return { ok: false, message: "Invalid project name" };
  if (!projectPath) return { ok: false, message: "Path is required" };
  const registry = loadRegistry();
  if (registry[name]) return { ok: false, message: `Project "${name}" already exists` };
  registry[name] = projectPath;
  saveRegistry(registry);
  return { ok: true, message: `Added "${name}" → ${projectPath}` };
}

/**
 * Remove a project alias.
 * @param {string} name - Alias to remove
 * @returns {{ ok: boolean, message: string }}
 */
export function removeProject(name) {
  const registry = loadRegistry();
  if (!registry[name]) return { ok: false, message: `Project "${name}" not found` };
  delete registry[name];
  saveRegistry(registry);
  return { ok: true, message: `Removed "${name}"` };
}

/**
 * Resolve a name or path to an absolute project path.
 * - If nameOrPath is a registered alias, returns its registered path.
 * - If nameOrPath is a path that exists on disk, returns it as-is.
 * - Otherwise returns null.
 * @param {string | undefined} nameOrPath
 * @returns {string | null}
 */
export function resolveProject(nameOrPath) {
  if (!nameOrPath) return null;
  const registry = loadRegistry();
  if (registry[nameOrPath]) return registry[nameOrPath];
  if (existsSync(nameOrPath)) return nameOrPath;
  return null;
}
