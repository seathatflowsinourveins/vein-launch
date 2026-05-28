/**
 * First-time setup wizard.
 *
 * Auto-detected on first `vein` invocation (absent ~/.vein/install.json)
 * or explicitly via `vein --setup --first-time`.
 *
 * Steps (each is try/caught individually; idempotent):
 *   1. create-dirs    — ~/.vein/{runs,eval-history,sessions,hud}
 *   2. npm-link       — `npm link` registers the "vein" CLI globally via npm's own bin dir
 *                       (no ~/bin copies, no symlinks, no PATH modification needed)
 *   4. vein-root-env  — set VEIN_LAUNCH_ROOT in User env
 *   5. cliproxy-key   — generate sk-ant-vein-<hex> → ~/cliproxy/config.yaml + ANTHROPIC_API_KEY
 *   6. install-json   — write ~/.vein/install.json
 *   7. auth-conflict  — warn if both claude.ai token + API key are set
 *
 * @module setup/first-time
 */

import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { exec } from "../lib/shell.mjs";

/** Directories to create under ~/.vein/ */
export const SETUP_DIRS = ["runs", "eval-history", "sessions", "hud"];

/** Ordered list of step names (used for idempotency checks in install.json) */
export const SETUP_STEPS = [
  "create-dirs",
  "npm-link",
  "vein-root-env",
  "cliproxy-key",
  "install-json",
  "auth-conflict",
];

/**
 * Read the current install.json, returning null if absent or unparseable.
 *
 * @param {string} veinDir - Path to ~/.vein
 * @returns {Promise<Object|null>}
 */
async function readInstallJson(veinDir) {
  try {
    const raw = await readFile(join(veinDir, "install.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Resolve the version from package.json next to this file's repo root.
 *
 * @param {string} repoRoot
 * @returns {Promise<string>}
 */
async function readVersion(repoRoot) {
  try {
    const raw = await readFile(join(repoRoot, "package.json"), "utf8");
    return JSON.parse(raw).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Step: create ~/.vein/{runs,eval-history,sessions,hud}
 *
 * @param {string} veinDir
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function stepCreateDirs(veinDir) {
  for (const sub of SETUP_DIRS) {
    await mkdir(join(veinDir, sub), { recursive: true });
  }
  return { ok: true, message: `Created ${SETUP_DIRS.map((d) => `~/.vein/${d}`).join(", ")}` };
}

/**
 * Step: `npm link` in the repo root registers the "vein" CLI globally.
 *
 * This is the SOTA Node.js CLI distribution pattern:
 * - package.json "bin" field declares the entry point
 * - npm creates a shim in its global bin dir (%APPDATA%\npm on Windows)
 * - That dir is already on PATH from the Node.js installation
 * - No ~/bin/, no manual symlinks, no PATH modification, no admin privileges
 * - Re-running is idempotent (npm link overwrites the existing shim)
 *
 * @param {string} repoRoot
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function stepNpmLink(repoRoot) {
  const result = await exec("npm link --ignore-scripts", { cwd: repoRoot, timeout: 30_000 });
  if (!result.ok) {
    return { ok: false, message: `npm link failed: ${result.stderr}` };
  }
  return { ok: true, message: "npm link → vein CLI registered globally" };
}

/**
 * Step: set VEIN_LAUNCH_ROOT in User environment.
 *
 * @param {string} repoRoot
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function stepVeinRootEnv(repoRoot) {
  if (process.env.VEIN_LAUNCH_ROOT === repoRoot) {
    return { ok: true, message: `VEIN_LAUNCH_ROOT already set to ${repoRoot}` };
  }

  if (process.platform === "win32") {
    // Pass the value via the process env (read as $env:... in PowerShell) rather
    // than interpolating it into the command string, so a path containing quotes
    // or cmd/PowerShell metacharacters cannot break out or inject commands.
    const result = await exec(
      `powershell -NonInteractive -Command ` +
        `"[Environment]::SetEnvironmentVariable('VEIN_LAUNCH_ROOT', $env:VEIN_SETUP_VALUE, 'User')"`,
      { shellMode: true, timeout: 10_000, env: { ...process.env, VEIN_SETUP_VALUE: repoRoot } },
    );
    return {
      ok: result.ok,
      message: result.ok ? `VEIN_LAUNCH_ROOT set to ${repoRoot}` : result.stderr,
    };
  }

  // POSIX
  const profilePath = join(homedir(), ".profile");
  const line = `\nexport VEIN_LAUNCH_ROOT="${repoRoot}"\n`;
  try {
    const existing = await readFile(profilePath, "utf8").catch(() => "");
    if (!existing.includes("VEIN_LAUNCH_ROOT")) {
      await writeFile(profilePath, existing + line, "utf8");
    }
    return { ok: true, message: `VEIN_LAUNCH_ROOT set in ~/.profile` };
  } catch (err) {
    return { ok: false, message: `Could not update ~/.profile: ${err.message}` };
  }
}

/**
 * Step: generate CLIProxy client-auth key and write to ~/cliproxy/config.yaml.
 * Also sets ANTHROPIC_API_KEY in User env.
 *
 * Skipped (idempotent) if a key matching 'sk-ant-vein-' already exists in config.
 *
 * @param {string} home
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function stepCliproxyKey(home) {
  const configDir = join(home, "cliproxy");
  const configPath = join(configDir, "config.yaml");

  // Check existing config
  let existing = "";
  try {
    existing = await readFile(configPath, "utf8");
  } catch {
    // Not yet created
  }

  if (existing.includes("sk-ant-vein-")) {
    return { ok: true, message: "CLIProxy key already configured" };
  }

  const key = `sk-ant-vein-${randomBytes(24).toString("hex")}`;
  await mkdir(configDir, { recursive: true });

  // Merge key into config.yaml (minimal YAML — no external dep)
  const newConfig = existing
    ? `${existing.trimEnd()}\n  - ${key}\n`
    : `# CLIProxy client-auth keys\napi-keys:\n  - ${key}\n`;

  await writeFile(configPath, newConfig, "utf8");

  // Persist in User env (Windows)
  if (process.platform === "win32") {
    // Value passed via the process env (read as $env:... in PowerShell), never
    // interpolated into the command string — no injection via the key value.
    const envResult = await exec(
      `powershell -NonInteractive -Command ` +
        `"[Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', $env:VEIN_SETUP_VALUE, 'User')"`,
      { shellMode: true, timeout: 10_000, env: { ...process.env, VEIN_SETUP_VALUE: key } },
    );
    // Don't silently succeed when persistence fails — the user thinks the key
    // was saved, then claude fails auth on next launch with no clear cause.
    if (!envResult.ok) {
      const reason =
        envResult.stderr ||
        `exit code ${envResult.exitCode}` + (envResult.timedOut ? " (timed out)" : "");
      return {
        ok: false,
        message: `CLIProxy key written to config.yaml but PowerShell persistence to User env failed: ${reason}`,
      };
    }
  }

  return { ok: true, message: `CLIProxy key generated: ${key.slice(0, 20)}...` };
}

/**
 * Step: write ~/.vein/install.json recording completed steps.
 *
 * @param {string} veinDir
 * @param {string} repoRoot
 * @param {string} version
 * @param {string[]} completedSteps
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function stepInstallJson(veinDir, repoRoot, version, completedSteps) {
  const payload = {
    version,
    repoRoot,
    installedAt: new Date().toISOString(),
    setupSteps: completedSteps,
  };
  await writeFile(join(veinDir, "install.json"), JSON.stringify(payload, null, 2), "utf8");
  return { ok: true, message: `install.json written (v${version})` };
}

/**
 * Step: detect auth conflict (both claude.ai token + API key present).
 *
 * @returns {{ok: boolean, warn?: boolean, message: string}}
 */
function stepAuthConflict() {
  const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasToken = Boolean(process.env.CLAUDE_AI_TOKEN) || Boolean(process.env.CLAUDE_ACCESS_TOKEN);

  if (hasApiKey && hasToken) {
    return {
      ok: true,
      warn: true,
      message:
        "Auth conflict: both ANTHROPIC_API_KEY and a claude.ai token are set. " +
        "Consider running `claude /logout` to remove the claude.ai session to avoid routing ambiguity.",
    };
  }
  return { ok: true, message: "No auth conflict detected" };
}

/**
 * Run the first-time setup wizard.
 *
 * @param {Object} [options]
 * @param {string} [options.repoRoot] - Repo root path (defaults to VEIN_LAUNCH_ROOT or cwd)
 * @param {boolean} [options.dryRun] - Skip all I/O side-effects
 * @returns {Promise<{ok: boolean, results: Array, installedAt: string}>}
 */
export async function runFirstTimeSetup(options = {}) {
  const { repoRoot = process.env.VEIN_LAUNCH_ROOT ?? process.cwd(), dryRun = false } = options;

  const home = homedir();
  const veinDir = join(home, ".vein");

  if (dryRun) {
    const results = SETUP_STEPS.map((name) => ({
      name,
      ok: true,
      message: "[dry-run] skipped",
      skipped: true,
    }));
    return { ok: true, results, installedAt: new Date().toISOString() };
  }

  // Read existing install.json to detect already-completed steps
  const existing = await readInstallJson(veinDir);
  const completedBefore = new Set(existing?.setupSteps ?? []);

  const version = await readVersion(repoRoot);
  const results = [];
  const completedNow = new Set(completedBefore);

  /**
   * Run one step; skip if already done; catch errors without aborting the rest.
   *
   * @param {string} name
   * @param {Function} fn
   */
  async function runStep(name, fn) {
    if (completedBefore.has(name)) {
      results.push({ name, ok: true, message: "already done", skipped: true });
      return;
    }
    try {
      const result = await fn();
      results.push({ name, ...result });
      if (result.ok) completedNow.add(name);
    } catch (err) {
      results.push({ name, ok: false, message: err.message ?? String(err) });
    }
  }

  await runStep("create-dirs", () => stepCreateDirs(veinDir));
  await runStep("npm-link", () => stepNpmLink(repoRoot));
  await runStep("vein-root-env", () => stepVeinRootEnv(repoRoot));
  await runStep("cliproxy-key", () => stepCliproxyKey(home));

  // install-json: idempotent — skip if already recorded in a prior run.
  // A fresh re-run that completes new steps will always include install-json in its
  // completedBefore (since it was written last time), so the skip is intentional.
  if (completedBefore.has("install-json")) {
    results.push({ name: "install-json", ok: true, message: "already done", skipped: true });
  } else {
    completedNow.add("install-json");
    try {
      const ijResult = await stepInstallJson(veinDir, repoRoot, version, Array.from(completedNow));
      results.push({ name: "install-json", ...ijResult });
    } catch (err) {
      results.push({ name: "install-json", ok: false, message: err.message ?? String(err) });
    }
  }

  // Auth-conflict is a warning-only check (synchronous)
  const authResult = stepAuthConflict();
  results.push({ name: "auth-conflict", ...authResult });
  if (authResult.ok) completedNow.add("auth-conflict");

  const ok = results.filter((r) => !r.skipped).every((r) => r.ok);
  return { ok, results, installedAt: new Date().toISOString() };
}

/**
 * Print the first-time setup results to stdout in a human-readable format.
 *
 * @param {{ok: boolean, results: Array, installedAt: string}} setupResult
 */
export function printSetupResult(setupResult) {
  console.log("\nvein --setup --first-time\n");
  for (const r of setupResult.results) {
    const icon = r.skipped ? "·" : r.ok && !r.warn ? "✓" : r.warn ? "⚠" : "✗";
    console.log(`  ${icon} ${r.name.padEnd(18)} ${r.message}`);
  }
  const passed = setupResult.results.filter((r) => r.ok && !r.skipped).length;
  const total = setupResult.results.filter((r) => !r.skipped).length;
  console.log(`\n  ${passed}/${total} steps completed\n`);
}
