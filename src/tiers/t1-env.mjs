import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createResult, Severity } from "../lib/result.mjs";

export const meta = { id: "t1-env", name: "ENV", modes: ["fast", "deep", "repair"] };

/** @returns {string} */
function stateDir() {
  return join(homedir(), ".vein");
}

/** @returns {{ check: string, actual: string, severity: string, remediation?: string }} */
function checkBaseUrl() {
  const val = process.env.ANTHROPIC_BASE_URL;
  if (!val) {
    return {
      check: "ANTHROPIC_BASE_URL",
      actual: "not set",
      severity: Severity.INFO,
    };
  }
  return {
    check: "ANTHROPIC_BASE_URL",
    actual: val,
    severity: Severity.PASS,
  };
}

/** @returns {{ check: string, actual: string, severity: string, remediation?: string }} */
function checkToolSearch() {
  const val = process.env.ENABLE_TOOL_SEARCH;
  if (val !== "true") {
    return {
      check: "ENABLE_TOOL_SEARCH",
      actual: val || "not set",
      severity: Severity.INFO,
    };
  }
  return {
    check: "ENABLE_TOOL_SEARCH",
    actual: "true",
    severity: Severity.PASS,
  };
}

/** @returns {{ check: string, actual: string, severity: string, remediation?: string }} */
function checkStateDir() {
  const dir = stateDir();
  if (!existsSync(dir)) {
    return {
      check: "state-dir",
      actual: `${dir} missing`,
      severity: Severity.WARN,
      remediation: "Run `vein --repair` to create ~/.vein/",
    };
  }
  return { check: "state-dir", actual: dir, severity: Severity.PASS };
}

/** @returns {{ check: string, actual: string, severity: string, remediation?: string }|null} */
function checkBaseUrlFormat() {
  const val = process.env.ANTHROPIC_BASE_URL;
  if (!val) return null;
  try {
    new URL(val);
    return null;
  } catch {
    return {
      check: "ANTHROPIC_BASE_URL-format",
      actual: `invalid URL: ${val}`,
      severity: Severity.WARN,
      remediation: "Set ANTHROPIC_BASE_URL to a valid URL (e.g. http://localhost:8317)",
    };
  }
}

/**
 * @param {string} projectDir
 * @returns {{ check: string, actual: string, severity: string, remediation?: string }|null}
 */
function checkGitignore(projectDir) {
  try {
    const content = readFileSync(join(projectDir || ".", ".gitignore"), "utf-8");
    const covered = content.split("\n").some((line) => {
      const trimmed = line.trim();
      return trimmed === ".vein" || trimmed === ".vein/";
    });
    if (!covered) {
      return {
        check: ".gitignore-coverage",
        actual: ".vein/ not in .gitignore",
        severity: Severity.WARN,
        remediation: "Add `.vein/` to your .gitignore to avoid committing session state",
      };
    }
    return null;
  } catch {
    return {
      check: ".gitignore-coverage",
      actual: ".gitignore not found or unreadable",
      severity: Severity.WARN,
      remediation: "Create a .gitignore and add `.vein/` to it",
    };
  }
}

/**
 * @param {import('../lib/result.mjs').TierResult[]} checks
 * @param {{ tierId: string, tierName: string, start: number }} meta
 */
function buildResult(checks, { tierId, tierName, start }) {
  const hasWarn = checks.some((c) => c.severity === Severity.WARN);
  const hasInfo = checks.some((c) => c.severity === Severity.INFO);

  if (hasWarn) {
    const warnChecks = checks.filter((c) => c.severity === Severity.WARN);
    return createResult({
      tierId,
      tierName,
      severity: Severity.WARN,
      evidence: warnChecks.map(({ check, actual, remediation }) => ({
        check,
        actual,
        remediation,
      })),
      durationMs: performance.now() - start,
    });
  }

  if (hasInfo) {
    const infoChecks = checks.filter((c) => c.severity === Severity.INFO);
    return createResult({
      tierId,
      tierName,
      severity: Severity.INFO,
      evidence: infoChecks.map(({ check, actual }) => ({ check, actual })),
      durationMs: performance.now() - start,
    });
  }

  return createResult({
    tierId,
    tierName,
    severity: Severity.PASS,
    evidence: checks.map(({ check, actual }) => ({ check, actual })),
    durationMs: performance.now() - start,
  });
}

export async function check(config, context) {
  const start = performance.now();
  const checks = [checkBaseUrl(), checkToolSearch(), checkStateDir()];

  if (context?.mode === "deep") {
    const urlFormat = checkBaseUrlFormat();
    if (urlFormat) checks.push(urlFormat);

    const gitignore = checkGitignore(config?.projectDir);
    if (gitignore) checks.push(gitignore);
  }

  return buildResult(checks, { tierId: meta.id, tierName: meta.name, start });
}

export async function repair(_config, _context) {
  const start = performance.now();
  const dir = stateDir();

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - sevenDaysMs;
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const filePath = join(dir, entry);
    try {
      const { mtime } = statSync(filePath);
      if (mtime.getTime() < cutoff) {
        unlinkSync(filePath);
      }
    } catch {
      // skip files we can't stat
    }
  }

  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.PASS,
    evidence: [{ check: "state-dir-repair", actual: `${dir} ensured, stale files pruned` }],
    durationMs: performance.now() - start,
  });
}
