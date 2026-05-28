/**
 * Doctor — system health check for vein-launch.
 *
 * `vein --doctor` audits all installation locations and reports:
 *   ✓ pass  — check succeeded
 *   ⚠ warn  — check succeeded with caveats (non-fatal)
 *   ✗ fail  — check failed (action required)
 *
 * Checks:
 *   vein-npm-link      `vein` CLI is registered via npm link (resolves in npm global bin)
 *   vein-launch-root   VEIN_LAUNCH_ROOT set AND matches install.json.repoRoot
 *   anthropic-api-key  ANTHROPIC_API_KEY set AND matches cliproxy/config.yaml entry
 *   deep-mode-run      ~/.vein/runs/ has ≥1 qualifying run (≥7 tiers, no fatal)
 *   cliproxy           PM2 online + /healthz 200
 *   cli-tools          node, claude, codex on PATH with expected versions
 *   version-sync       package.json version matches latest git tag
 *   install-json       ~/.vein/install.json exists and is parseable
 *
 * @module setup/doctor
 */

import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { exec } from "../lib/shell.mjs";

/** All check names in display order */
export const CHECK_NAMES = [
  "vein-npm-link",
  "vein-launch-root",
  "anthropic-api-key",
  "deep-mode-run",
  "cliproxy",
  "cli-tools",
  "version-sync",
  "install-json",
];

/**
 * @typedef {{ name: string, status: "pass" | "warn" | "fail", message: string }} DoctorCheck
 * @typedef {{ passed: number, warned: number, failed: number, total: number }} DoctorSummary
 */

// ── Individual checks ─────────────────────────────────────────────────────────

/**
 * Check 1: `vein` CLI is registered via npm link (SOTA distribution).
 * Verifies `npm ls -g vein-launch` reports the package as linked.
 *
 * @returns {Promise<DoctorCheck>}
 */
async function checkVeinNpmLink() {
  try {
    const result = await exec("npm ls -g vein-launch --depth=0", { timeout: 10_000 });
    if (result.ok && result.stdout.includes("vein-launch")) {
      return { name: "vein-npm-link", status: "pass", message: "npm link active" };
    }
    return {
      name: "vein-npm-link",
      status: "fail",
      message: "vein-launch not found in npm global — run `npm link` in the repo root",
    };
  } catch {
    return {
      name: "vein-npm-link",
      status: "fail",
      message: "npm ls failed — ensure npm is installed and on PATH",
    };
  }
}

/**
 * Check 2: VEIN_LAUNCH_ROOT set and matches install.json.repoRoot
 *
 * @param {string} veinDir
 * @returns {Promise<DoctorCheck>}
 */
async function checkVeinLaunchRoot(veinDir) {
  const envVal = process.env.VEIN_LAUNCH_ROOT;
  if (!envVal) {
    return {
      name: "vein-launch-root",
      status: "fail",
      message: "VEIN_LAUNCH_ROOT not set — run `vein --setup --first-time`",
    };
  }

  let installJson;
  try {
    const raw = await readFile(join(veinDir, "install.json"), "utf8");
    installJson = JSON.parse(raw);
  } catch {
    // install.json missing is caught by a separate check
    return { name: "vein-launch-root", status: "pass", message: envVal };
  }

  if (installJson.repoRoot && installJson.repoRoot !== envVal) {
    return {
      name: "vein-launch-root",
      status: "fail",
      message: `VEIN_LAUNCH_ROOT=${envVal} but install.json says ${installJson.repoRoot}`,
    };
  }

  return { name: "vein-launch-root", status: "pass", message: envVal };
}

/**
 * Check 3: ANTHROPIC_API_KEY set and present in cliproxy/config.yaml
 *
 * @param {string} home
 * @returns {Promise<DoctorCheck>}
 */
async function checkAnthropicApiKey(home) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      name: "anthropic-api-key",
      status: "fail",
      message: "ANTHROPIC_API_KEY not set — run `vein --setup --first-time`",
    };
  }

  // Redact: show prefix + last 6 chars only
  const redacted = `${key.slice(0, 14)}...${key.slice(-6)}`;

  // Check if key appears in cliproxy config
  const configPath = join(home, "cliproxy", "config.yaml");
  try {
    const config = await readFile(configPath, "utf8");
    if (!config.includes(key)) {
      return {
        name: "anthropic-api-key",
        status: "warn",
        message: `${redacted} set but not found in ~/cliproxy/config.yaml`,
      };
    }
  } catch {
    return {
      name: "anthropic-api-key",
      status: "warn",
      message: `${redacted} set but ~/cliproxy/config.yaml not found`,
    };
  }

  return { name: "anthropic-api-key", status: "pass", message: `set (${redacted})` };
}

/**
 * Check 4: ~/.vein/runs/ has at least one qualifying deep-mode run
 * (A "qualifying" run has ≥7 tier results and no fatal severity in the JSON file.)
 *
 * @param {string} veinDir
 * @returns {Promise<DoctorCheck>}
 */
async function checkDeepModeRun(veinDir) {
  const runsDir = join(veinDir, "runs");
  try {
    await stat(runsDir);
  } catch {
    return {
      name: "deep-mode-run",
      status: "warn",
      message: "~/.vein/runs/ does not exist — run `vein --deep <project>` once",
    };
  }

  // List JSON files in runs dir using exec (avoids reading raw directory into context)
  const result = await exec(
    `node -e "const fs=require('fs');const d='${runsDir}';try{const f=fs.readdirSync(d).filter(x=>x.endsWith('.json'));if(!f.length){process.stdout.write('NONE')}else{const data=JSON.parse(fs.readFileSync(d+'/'+f.sort().reverse()[0],'utf8'));const r=data.results||[];const ok=r.length>=7&&!r.some(x=>x.severity==='error'||x.severity==='block');const ts=data.timestamp||'unknown';process.stdout.write(ok?'OK:'+ts:'PARTIAL:'+r.length)}}catch(e){process.stdout.write('ERR:'+e.message)}"`,
    { shellMode: true, timeout: 10_000 },
  );

  if (!result.ok || result.stdout === "NONE" || result.stdout.startsWith("ERR")) {
    return {
      name: "deep-mode-run",
      status: "warn",
      message: "no qualifying deep-mode run found — run `vein --deep <project>` once",
    };
  }

  if (result.stdout.startsWith("PARTIAL")) {
    return {
      name: "deep-mode-run",
      status: "warn",
      message: `last run had fewer than 7 tiers: ${result.stdout}`,
    };
  }

  const ts = result.stdout.replace(/^OK:/, "");
  return { name: "deep-mode-run", status: "pass", message: `last qualifying run: ${ts}` };
}

/**
 * Check 5: CLIProxy daemon — PM2 online + /healthz 200
 *
 * @returns {Promise<DoctorCheck>}
 */
async function checkCliproxy() {
  const pm2Result = await exec("pm2 list", { timeout: 10_000 });
  if (!pm2Result.ok) {
    return {
      name: "cliproxy",
      status: "fail",
      message: "PM2 not available — install pm2 and start CLIProxy",
    };
  }

  if (!pm2Result.stdout.toLowerCase().includes("online")) {
    return {
      name: "cliproxy",
      status: "fail",
      message: "CLIProxy process not online in PM2",
    };
  }

  // Probe /healthz
  const port = process.env.CLIPROXY_PORT ?? "3284";
  const healthResult = await exec(
    `node -e "const http=require('http');const req=http.get('http://localhost:${port}/healthz',r=>{process.stdout.write(String(r.statusCode));r.destroy()});req.on('error',e=>process.stderr.write(e.message))"`,
    { shellMode: true, timeout: 5_000 },
  );

  if (!healthResult.ok || healthResult.stdout !== "200") {
    return {
      name: "cliproxy",
      status: "warn",
      message: `PM2 online but /healthz returned ${healthResult.stdout || healthResult.stderr}`,
    };
  }

  return { name: "cliproxy", status: "pass", message: `PM2 online, /healthz 200` };
}

/**
 * Check 6: T3 CLI tools on PATH with version info
 * Tools: node, claude, codex, gh, rtk, pm2
 *
 * @returns {Promise<DoctorCheck>}
 */
async function checkCliTools() {
  const tools = [
    { name: "node", versionArg: "--version" },
    { name: "claude", versionArg: "--version" },
    { name: "codex", versionArg: "--version" },
    { name: "gh", versionArg: "--version" },
    { name: "rtk", versionArg: "--version" },
    { name: "pm2", versionArg: "--version" },
  ];

  const found = [];
  const missing = [];

  for (const tool of tools) {
    const result = await exec(`${tool.name} ${tool.versionArg}`, { timeout: 5_000 });
    if (result.ok) {
      const version = (result.stdout || result.stderr).split("\n")[0].trim();
      found.push(`${tool.name} ${version}`);
    } else {
      missing.push(tool.name);
    }
  }

  if (missing.length > 0) {
    return {
      name: "cli-tools",
      status: "warn",
      message: `found: ${found.join(", ")} | missing: ${missing.join(", ")}`,
    };
  }

  return { name: "cli-tools", status: "pass", message: found.join(", ") };
}

/**
 * Check 7: package.json version matches latest git tag
 *
 * @param {string} repoRoot
 * @returns {Promise<DoctorCheck>}
 */
async function checkVersionSync(repoRoot) {
  let pkgVersion = "unknown";
  try {
    const raw = await readFile(join(repoRoot, "package.json"), "utf8");
    pkgVersion = JSON.parse(raw).version ?? "unknown";
  } catch {
    return {
      name: "version-sync",
      status: "warn",
      message: `cannot read package.json from ${repoRoot}`,
    };
  }

  const tagResult = await exec("git describe --tags --abbrev=0", {
    timeout: 5_000,
    cwd: repoRoot,
  });
  const gitTag = tagResult.stdout.replace(/^v/, "").trim();

  if (!tagResult.ok || !gitTag) {
    return {
      name: "version-sync",
      status: "warn",
      message: `package.json ${pkgVersion} — no git tag found`,
    };
  }

  if (gitTag !== pkgVersion) {
    return {
      name: "version-sync",
      status: "warn",
      message: `package.json ${pkgVersion} vs git tag v${gitTag} (mismatch)`,
    };
  }

  return {
    name: "version-sync",
    status: "pass",
    message: `package.json ${pkgVersion} vs git tag v${gitTag} ✓`,
  };
}

/**
 * Check 8: ~/.vein/install.json exists and is parseable
 *
 * @param {string} veinDir
 * @returns {Promise<DoctorCheck>}
 */
async function checkInstallJson(veinDir) {
  const path = join(veinDir, "install.json");
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    const date = parsed.installedAt
      ? new Date(parsed.installedAt).toLocaleDateString()
      : "unknown date";
    return {
      name: "install-json",
      status: "pass",
      message: `valid, installed ${date}`,
    };
  } catch (err) {
    if (err.code === "ENOENT") {
      return {
        name: "install-json",
        status: "fail",
        message: "~/.vein/install.json not found — run `vein --setup --first-time`",
      };
    }
    return {
      name: "install-json",
      status: "fail",
      message: `~/.vein/install.json parse error: ${err.message}`,
    };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run all doctor checks.
 *
 * @param {Object} [options]
 * @param {string} [options.repoRoot] - Repo root (defaults to VEIN_LAUNCH_ROOT or cwd)
 * @returns {Promise<{ checks: DoctorCheck[], summary: DoctorSummary }>}
 */
export async function runDoctor(options = {}) {
  const repoRoot = options.repoRoot ?? process.env.VEIN_LAUNCH_ROOT ?? process.cwd();
  const home = homedir();
  const veinDir = join(home, ".vein");

  const checks = await Promise.all([
    checkVeinNpmLink(),
    checkVeinLaunchRoot(veinDir),
    checkAnthropicApiKey(home),
    checkDeepModeRun(veinDir),
    checkCliproxy(),
    checkCliTools(),
    checkVersionSync(repoRoot),
    checkInstallJson(veinDir),
  ]);

  const passed = checks.filter((c) => c.status === "pass").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  const failed = checks.filter((c) => c.status === "fail").length;

  return {
    checks,
    summary: { passed, warned, failed, total: checks.length },
  };
}

/**
 * Format doctor results into the human-readable output string.
 *
 * @param {DoctorCheck[]} checks
 * @param {DoctorSummary} summary
 * @returns {string}
 */
export function formatDoctorOutput(checks, summary) {
  const lines = ["", "vein doctor — system health check", ""];

  for (const c of checks) {
    const icon = c.status === "pass" ? "✓" : c.status === "warn" ? "⚠" : "✗";
    const label = c.name.padEnd(20);
    lines.push(`  ${icon} ${label} ${c.message}`);
  }

  const parts = [`${summary.passed}/${summary.total} checks passed`];
  if (summary.warned > 0) parts.push(`${summary.warned} warning${summary.warned > 1 ? "s" : ""}`);
  if (summary.failed > 0) parts.push(`${summary.failed} failed`);

  lines.push(`\n  ${parts.join(", ")}\n`);
  return lines.join("\n");
}

/**
 * Run doctor and print to stdout.
 *
 * @param {Object} [options]
 * @returns {Promise<number>} Exit code: 0 = all pass/warn, 1 = any fail
 */
export async function runDoctorAndPrint(options = {}) {
  const { checks, summary } = await runDoctor(options);
  process.stdout.write(formatDoctorOutput(checks, summary));
  return summary.failed > 0 ? 1 : 0;
}
