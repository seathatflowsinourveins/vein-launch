import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createResult, Severity } from "../lib/result.mjs";

export const meta = { id: "t5-drift", name: "Drift", modes: ["deep", "repair"] };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** @returns {string} */
function mcpConfigPath() {
  return join(homedir(), ".claude", ".mcp.json");
}

/** @returns {string} */
function cachePath() {
  return join(homedir(), ".vein", "drift-cache.json");
}

/**
 * Extract version from an npx args array (e.g. ["gitnexus@1.6.5", ...] → "1.6.5").
 * Returns null for non-npx commands.
 * @param {string[]} args
 * @returns {string|null}
 */
function extractNpxVersion(args) {
  for (const arg of args) {
    const match = String(arg).match(/@(\d+\.\d+\.\d+)(?:[^/]*)$/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Compare two semver strings. Returns 0 if equal, 1 if a > b, -1 if a < b.
 * Only compares major.minor.patch numerically.
 * @param {string} a
 * @param {string} b
 * @returns {-1|0|1}
 */
function compareSemver(a, b) {
  const [aMaj, aMin, aPat] = a.split(".").map(Number);
  const [bMaj, bMin, bPat] = b.split(".").map(Number);
  if (aMaj !== bMaj) return aMaj > bMaj ? 1 : -1;
  if (aMin !== bMin) return aMin > bMin ? 1 : -1;
  if (aPat !== bPat) return aPat > bPat ? 1 : -1;
  return 0;
}

function configHash(pinnedVersions) {
  const input = JSON.stringify(pinnedVersions ?? {});
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Try to load a valid fresh cache entry. Returns null on miss, stale, or config mismatch.
 * @param {Record<string,string>} pinnedVersions
 * @returns {{ severity: string, evidence: object[], durationMs: number }|null}
 */
function loadCache(pinnedVersions) {
  const path = cachePath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    if (!raw.timestamp || Date.now() - raw.timestamp >= CACHE_TTL_MS) return null;
    if (raw.configHash !== configHash(pinnedVersions)) return null;
    if (!raw.severity || !Array.isArray(raw.evidence)) return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Persist a result payload to the disk cache.
 * @param {{ severity: string, evidence: object[], durationMs: number }} payload
 * @param {Record<string,string>} pinnedVersions
 */
function saveCache(payload, pinnedVersions) {
  try {
    const dir = join(homedir(), ".vein");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      cachePath(),
      JSON.stringify({ timestamp: Date.now(), configHash: configHash(pinnedVersions), ...payload }),
    );
  } catch {
    // Non-fatal
  }
}

/**
 * Run the live MCP drift check.
 * @param {Record<string,string>} pinnedVersions
 * @returns {{ severity: string, evidence: Array<{check:string,actual:string,expected?:string,remediation?:string}> }}
 */
function runDriftCheck(pinnedVersions) {
  const mcpPath = mcpConfigPath();
  if (!existsSync(mcpPath)) {
    return {
      severity: Severity.INFO,
      evidence: [
        { check: "mcp-config", actual: "no global MCP config found at ~/.claude/.mcp.json" },
      ],
    };
  }

  let mcpJson;
  try {
    mcpJson = JSON.parse(readFileSync(mcpPath, "utf-8"));
  } catch (err) {
    return {
      severity: Severity.WARN,
      evidence: [
        {
          check: "mcp-config-parse",
          actual: `Failed to parse ~/.claude/.mcp.json: ${err.message}`,
          remediation: "Fix or regenerate ~/.claude/.mcp.json",
        },
      ],
    };
  }

  const servers = mcpJson?.mcpServers ?? {};
  const evidence = [];
  let worst = Severity.PASS;
  let checkedCount = 0;

  for (const [serverKey, serverDef] of Object.entries(servers)) {
    // Normalise server key: match either exact key or the last path segment of the command
    const pin = pinnedVersions[serverKey];
    if (!pin) continue; // No pin for this server — skip

    checkedCount++;
    const command = serverDef?.command ?? "";
    const args = serverDef?.args ?? [];

    // Extract version: only from npx args for now
    const isNpx = String(command).toLowerCase().includes("npx") || command === "npx";
    const installed = isNpx ? extractNpxVersion(args) : null;

    if (!installed) {
      // Can't determine version from config → skip silently (non-npx binary)
      checkedCount--;
      continue;
    }

    const cmp = compareSemver(installed, pin);
    if (cmp === 0) {
      evidence.push({ check: `${serverKey}-version`, actual: installed });
    } else {
      const [instMaj] = installed.split(".").map(Number);
      const [pinMaj] = pin.split(".").map(Number);
      const isMajor = instMaj !== pinMaj;
      const sev = isMajor ? Severity.BLOCK : Severity.WARN;
      if (sev === Severity.BLOCK) worst = Severity.BLOCK;
      else if (worst !== Severity.BLOCK) worst = Severity.WARN;

      evidence.push({
        check: `${serverKey}-version`,
        actual: installed,
        expected: pin,
        remediation: `Update ${serverKey} to version ${pin}. Run: npx -y ${serverKey}@${pin}`,
      });
    }
  }

  if (checkedCount === 0) {
    evidence.push({ check: "mcp-pins-skipped", actual: "no pinned servers found in MCP config" });
  }

  // When worst is WARN or BLOCK, all evidence items must have remediation.
  // Add it to any PASS evidence that's included in a degraded result.
  if (worst === Severity.WARN || worst === Severity.BLOCK) {
    const remediated = evidence.map((ev) => {
      if (ev.remediation) return ev;
      return {
        ...ev,
        remediation: `Verify ${ev.check} — no action required but result set is degraded`,
      };
    });
    return { severity: worst, evidence: remediated };
  }

  return { severity: worst, evidence };
}

/**
 * @param {object} config
 * @param {object} _context
 * @returns {Promise<import("../lib/result.mjs").TierResult>}
 */
export async function check(config, _context) {
  const start = performance.now();

  const pinnedVersions = config?.mcp?.pinnedVersions ?? {};

  const cached = loadCache(pinnedVersions);
  if (cached) {
    return createResult({
      tierId: meta.id,
      tierName: meta.name,
      severity: cached.severity,
      evidence: cached.evidence,
      durationMs: performance.now() - start,
      cacheSource: "disk",
    });
  }

  const { severity, evidence } = runDriftCheck(pinnedVersions);

  const durationMs = performance.now() - start;
  const payload = { severity, evidence, durationMs, tierId: meta.id, tierName: meta.name };
  saveCache(payload, pinnedVersions);

  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity,
    evidence,
    durationMs,
  });
}

/**
 * @param {object} config
 * @param {object} _context
 * @returns {Promise<import("../lib/result.mjs").TierResult>}
 */
export async function repair(config, _context) {
  const start = performance.now();
  const pinnedVersions = config?.mcp?.pinnedVersions ?? {};
  const { severity, evidence } = runDriftCheck(pinnedVersions);

  if (severity === Severity.PASS || severity === Severity.INFO) {
    return createResult({
      tierId: meta.id,
      tierName: meta.name,
      severity: Severity.PASS,
      evidence: [
        { check: "drift-repair", actual: "no drift detected — all pinned servers up to date" },
      ],
      durationMs: performance.now() - start,
    });
  }

  // Return WARN with repair instructions (cannot auto-update MCP servers safely)
  const driftedServers = evidence
    .filter((ev) => ev.expected)
    .map((ev) => `${ev.check}: installed=${ev.actual}, pinned=${ev.expected}`)
    .join("; ");

  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.WARN,
    evidence: [
      {
        check: "drift-repair",
        actual: driftedServers || "drift detected",
        remediation:
          "MCP servers cannot be auto-updated safely. Apply the remediations from each check above manually.",
      },
    ],
    durationMs: performance.now() - start,
  });
}
