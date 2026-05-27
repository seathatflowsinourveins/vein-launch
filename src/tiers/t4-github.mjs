import { createResult, Severity } from "../lib/result.mjs";
import { exec } from "../lib/shell.mjs";

export const meta = { id: "t4-github", name: "GitHub", modes: ["deep", "repair"] };

const CRITICAL_SCOPES = ["repo", "workflow"];
const OPTIONAL_SCOPES = ["security_events"];

/** Remediation text constants */
const REMEDIATION_AUTH_LOGIN = "gh auth login";
const REMEDIATION_AUTH_REFRESH = "gh auth refresh -s repo,workflow,security_events";
const REMEDIATION_SIGNING =
  "git config --global gpg.format ssh && git config --global user.signingkey ~/.ssh/id_ed25519.pub";

/**
 * Check GitHub auth scopes. Returns evidence array (may be empty on pass).
 * @returns {{ passEvidence: object[], blockEvidence: object[] }}
 */
async function checkAuthScopes() {
  const res = await exec("gh auth status");
  const combined = `${res.stdout} ${res.stderr}`;

  if (!res.ok && combined.includes("not logged")) {
    return {
      passEvidence: [],
      blockEvidence: [
        {
          check: "gh-auth-login",
          actual: "not authenticated",
          expected: "logged in to github.com",
          remediation: REMEDIATION_AUTH_LOGIN,
        },
      ],
    };
  }

  const scopeLine = combined.split(/\r?\n/).find((l) => /token scopes?:/i.test(l));
  const scopes = new Set(
    (scopeLine ?? "")
      .replace(/^.*token scopes?:/i, "")
      .split(",")
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean),
  );
  const missingCritical = CRITICAL_SCOPES.filter((s) => !scopes.has(s));
  const missingOptional = OPTIONAL_SCOPES.filter((s) => !scopes.has(s));

  if (missingCritical.length > 0) {
    return {
      passEvidence: [],
      blockEvidence: [
        {
          check: "gh-auth-scopes",
          actual: `missing critical scopes: ${missingCritical.join(", ")}`,
          expected: CRITICAL_SCOPES.join(", "),
          remediation: REMEDIATION_AUTH_REFRESH,
        },
      ],
      warnEvidence: [],
    };
  }

  const warnEvidence =
    missingOptional.length > 0
      ? [
          {
            check: "gh-auth-scopes-optional",
            actual: `missing optional scopes: ${missingOptional.join(", ")}`,
            remediation: "Create a fine-grained PAT with security_events for code scanning alerts",
          },
        ]
      : [];

  return {
    passEvidence: [
      { check: "gh-auth-scopes", actual: `critical scopes present: ${CRITICAL_SCOPES.join(", ")}` },
    ],
    blockEvidence: [],
    warnEvidence,
  };
}

/**
 * Check SSH commit-signing configuration. Returns evidence array.
 * @returns {{ passEvidence: object[], warnEvidence: object[] }}
 */
async function checkSshSigning() {
  const [formatRes, keyRes] = await Promise.all([
    exec("git config gpg.format"),
    exec("git config user.signingkey"),
  ]);

  const warnEvidence = [];

  if (!formatRes.ok || formatRes.stdout !== "ssh") {
    warnEvidence.push({
      check: "git-signing-format",
      actual: formatRes.ok ? formatRes.stdout || "(empty)" : "not set",
      expected: "ssh",
      remediation: REMEDIATION_SIGNING,
    });
  }

  if (!keyRes.ok || !keyRes.stdout) {
    warnEvidence.push({
      check: "git-signing-key",
      actual: "not set",
      expected: "path to SSH public key",
      remediation: REMEDIATION_SIGNING,
    });
  }

  if (warnEvidence.length === 0) {
    return {
      passEvidence: [{ check: "git-ssh-signing", actual: "configured" }],
      warnEvidence: [],
    };
  }

  return { passEvidence: [], warnEvidence };
}

/**
 * @param {Object} _config
 * @param {{ mode?: string }} _context
 * @returns {Promise<import("../lib/result.mjs").TierResult>}
 */
export async function check(_config, _context) {
  const start = performance.now();

  const [authResult, signingResult] = await Promise.all([checkAuthScopes(), checkSshSigning()]);

  // BLOCK takes priority — return only BLOCK evidence
  if (authResult.blockEvidence.length > 0) {
    return createResult({
      tierId: meta.id,
      tierName: meta.name,
      severity: Severity.BLOCK,
      evidence: authResult.blockEvidence,
      durationMs: performance.now() - start,
    });
  }

  // Combine all WARN evidence (optional scopes + signing)
  const allWarn = [...(authResult.warnEvidence || []), ...signingResult.warnEvidence];
  if (allWarn.length > 0) {
    return createResult({
      tierId: meta.id,
      tierName: meta.name,
      severity: Severity.WARN,
      evidence: allWarn,
      durationMs: performance.now() - start,
    });
  }

  // All pass
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.PASS,
    evidence: [...authResult.passEvidence, ...signingResult.passEvidence],
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

  // Always refresh auth scopes
  await exec("gh auth refresh -s repo,workflow,security_events");

  // Check and fix SSH signing if needed
  const [formatRes, keyRes] = await Promise.all([
    exec("git config gpg.format"),
    exec("git config user.signingkey"),
  ]);

  const repairEvidence = [{ check: "gh-auth-refresh", actual: "ran gh auth refresh" }];

  if (!formatRes.ok || formatRes.stdout !== "ssh") {
    await exec("git config --global gpg.format ssh");
    repairEvidence.push({ check: "git-signing-format-set", actual: "gpg.format set to ssh" });
  }

  if (!keyRes.ok || !keyRes.stdout) {
    await exec("git config --global user.signingkey ~/.ssh/id_ed25519.pub");
    repairEvidence.push({
      check: "git-signing-key-set",
      actual: "user.signingkey set to ~/.ssh/id_ed25519.pub",
    });
  }

  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.PASS,
    evidence: repairEvidence,
    durationMs: performance.now() - start,
  });
}
