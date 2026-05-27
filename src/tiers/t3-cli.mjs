import { createResult, Severity } from "../lib/result.mjs";
import { exec } from "../lib/shell.mjs";

export const meta = { id: "t3-cli", name: "CLI Tools", modes: ["fast", "deep", "repair"] };

/** @type {Array<{name: string, command: string, minVersion: string, critical: boolean}>} */
const TOOL_PINS = [
  { name: "node", command: "node --version", minVersion: "24.0.0", critical: true },
  { name: "python", command: "python3 --version", minVersion: "3.13.0", critical: false },
  { name: "gh", command: "gh --version", minVersion: "2.0.0", critical: false },
  { name: "claude", command: "claude --version", minVersion: "1.0.0", critical: true },
  { name: "rtk", command: "rtk --version", minVersion: "0.42.0", critical: false },
  { name: "codex", command: "codex --version", minVersion: "0.1.0", critical: false },
];

/**
 * Compare two semver strings numerically.
 * @param {string} actual
 * @param {string} minimum
 * @returns {-1 | 0 | 1}
 */
export function compareVersions(actual, minimum) {
  const a = actual.split(".").map(Number);
  const b = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

/** Extract semver string from command output. @returns {string | null} */
function parseVersion(output) {
  const m = output.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

/**
 * @param {Object} _config
 * @param {{ mode?: string }} context
 * @returns {Promise<import("../lib/result.mjs").TierResult>}
 */
export async function check(_config, context) {
  const start = performance.now();

  const results = await Promise.all(TOOL_PINS.map((tool) => exec(tool.command)));

  const passEvidence = [];
  const failEvidence = [];

  for (let i = 0; i < TOOL_PINS.length; i++) {
    const tool = TOOL_PINS[i];
    const res = results[i];

    if (!res.ok) {
      failEvidence.push({
        check: `${tool.name}-missing`,
        actual: "not found",
        remediation: `Install ${tool.name} (https://github.com/${tool.name})`,
      });
      continue;
    }

    const version = parseVersion(res.stdout);
    if (!version) {
      failEvidence.push({
        check: `${tool.name}-unparseable`,
        actual: res.stdout || "(empty)",
        remediation: `Verify ${tool.name} installation; expected semver output`,
      });
      continue;
    }

    if (compareVersions(version, tool.minVersion) < 0) {
      failEvidence.push({
        check: `${tool.name}-outdated`,
        actual: version,
        expected: `>= ${tool.minVersion}`,
        remediation: `Upgrade ${tool.name} to >= ${tool.minVersion}`,
      });
      continue;
    }

    passEvidence.push({ check: `${tool.name}-version`, actual: version });
  }

  // Deep mode: check gh auth scopes
  if (context?.mode === "deep") {
    const authRes = await exec("gh auth status");
    const combined = authRes.stdout + authRes.stderr;
    const requiredScopes = ["repo", "workflow", "security_events"];
    const missing = requiredScopes.filter((s) => !combined.includes(s));
    if (missing.length > 0) {
      failEvidence.push({
        check: "gh-auth-scopes",
        actual: `missing scopes: ${missing.join(", ")}`,
        expected: requiredScopes.join(", "),
        remediation: "gh auth refresh -s repo,workflow,security_events",
      });
    }
  }

  const hasBlock = failEvidence.some((e) => {
    const toolPin = TOOL_PINS.find(
      (t) =>
        e.check === `${t.name}-missing` ||
        e.check === `${t.name}-outdated` ||
        e.check === `${t.name}-unparseable`,
    );
    return toolPin?.critical === true;
  });

  const severity = hasBlock
    ? Severity.BLOCK
    : failEvidence.length > 0
      ? Severity.WARN
      : Severity.PASS;

  const evidence = severity === Severity.PASS ? passEvidence : failEvidence;

  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity,
    evidence,
    durationMs: performance.now() - start,
  });
}

/**
 * @param {Object} _config
 * @param {Object} _context
 * @returns {Promise<import("../lib/result.mjs").TierResult>}
 */
export async function repair(_config, _context) {
  const start = performance.now();

  const miseCheck = await exec("mise --version");

  if (!miseCheck.ok) {
    return createResult({
      tierId: meta.id,
      tierName: meta.name,
      severity: Severity.WARN,
      evidence: [
        {
          check: "mise-missing",
          actual: "mise not found",
          remediation: "Install mise: https://mise.jdx.dev — then run `mise install`",
        },
      ],
      durationMs: performance.now() - start,
    });
  }

  const installRes = await exec("mise install");

  if (!installRes.ok) {
    return createResult({
      tierId: meta.id,
      tierName: meta.name,
      severity: Severity.BLOCK,
      evidence: [
        {
          check: "mise-install-failed",
          actual: installRes.stderr || "non-zero exit",
          remediation: "Run `mise install` manually and resolve errors",
        },
      ],
      durationMs: performance.now() - start,
    });
  }

  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.PASS,
    evidence: [{ check: "mise-install", actual: "all tools installed via mise" }],
    durationMs: performance.now() - start,
  });
}
