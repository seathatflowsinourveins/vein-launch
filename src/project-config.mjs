/**
 * Project Registry — manages ~/.vein/projects.json for alias-based project resolution.
 *
 * `vein trading` resolves "trading" to its registered absolute path.
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

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
 *
 * Security: Uses realpathSync to resolve symlinks before the containment check, so a
 * symlink inside homedir that points outside cannot bypass the guard. The old check
 * `canonical.includes("..")` was a no-op because path.resolve already eliminates `..`
 * sequences — it was unreachable dead code. This implementation is correct.
 *
 * @param {string | undefined} nameOrPath
 * @returns {string | null}
 */
export function resolveProject(nameOrPath) {
  if (!nameOrPath) return null;
  const registry = loadRegistry();
  const resolved = registry[nameOrPath] ?? (existsSync(nameOrPath) ? nameOrPath : null);
  if (!resolved) return null;

  // Resolve symlinks to get the true filesystem path.
  let real;
  try {
    real = realpathSync(resolve(resolved));
  } catch {
    // Path does not exist on disk (e.g. registered path was deleted). Fall back to
    // path.resolve so we can still serve registry entries for paths that may be
    // created later (CI bootstrap, NFS mounts). The containment check still applies.
    real = resolve(resolved);
  }

  // Containment check: the real path must start with homedir (covers the common case)
  // or with one of the registered project root directories from the registry values.
  // This blocks symlink-based escapes to /etc, /tmp, or other arbitrary locations.
  //
  // Use resolve(homedir()) rather than homedir() directly: on Windows path.resolve() and
  // realpathSync() return drive-absolute paths (C:\...) while homedir() returns them too,
  // but mixing slashes would break the startsWith check. resolve() normalises both.
  const home = resolve(homedir());
  const homeWithSep = home.endsWith(sep) ? home : home + sep;

  if (real !== home && !real.startsWith(homeWithSep)) {
    // Also allow paths within any registered project's own directory hierarchy.
    // (Allows project dirs on non-home volumes as long as the registry was populated
    // by a trusted addProject call, which is the intended use case.)
    const registeredRoots = Object.values(registry).map((p) => {
      try {
        return realpathSync(resolve(p));
      } catch {
        return resolve(p);
      }
    });
    const withinRegistered = registeredRoots.some((root) => {
      const rootWithSep = root.endsWith(sep) ? root : root + sep;
      return real === root || real.startsWith(rootWithSep);
    });
    if (!withinRegistered) {
      return null;
    }
  }

  return real;
}
