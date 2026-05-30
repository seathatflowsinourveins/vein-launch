#!/usr/bin/env node
/**
 * hud-bridge.mjs — SP2: CLIProxy management API bridge for claude-hud.
 *
 * Polls CLIProxy's management API and writes an external-usage.json file that
 * claude-hud reads on each render.  Runs as a PM2 sidecar process.
 *
 * Architecture:
 *   CLIProxy (:8317) ──GET mgmt API──► hud-bridge ──writes──► ~/.vein/hud/external-usage.json
 *
 * Usage (standalone):
 *   node tools/hud-bridge.mjs
 *
 * Configuration (in priority order):
 *   1. MANAGEMENT_PASSWORD env var
 *   2. CLIPROXY_PORT env var (default: 8317)
 *   3. ~/.vein/hud-bridge-config.json (managementKey, pollIntervalMs, cliproxyPort)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_PORT = 8317;

export const OUTPUT_PATH = join(homedir(), ".vein", "hud", "external-usage.json");
export const CONFIG_PATH = join(homedir(), ".vein", "hud-bridge-config.json");
export const SESSIONS_DIR = join(homedir(), ".vein", "sessions");

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} BridgeConfig
 * @property {string|null} managementKey
 * @property {number} pollIntervalMs
 * @property {number} cliproxyPort
 */

/**
 * Load config: env vars take precedence, then ~/.vein/hud-bridge-config.json.
 *
 * @returns {Promise<BridgeConfig>}
 */
export async function loadConfig() {
  /** @type {Partial<BridgeConfig>} */
  let fileConfig = {};

  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    fileConfig = JSON.parse(raw);
  } catch {
    // Config file is optional — missing or unparseable is fine.
  }

  const managementKey = process.env.MANAGEMENT_PASSWORD ?? fileConfig.managementKey ?? null;

  const pollIntervalMs = fileConfig.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const cliproxyPort =
    process.env.CLIPROXY_PORT != null
      ? Number(process.env.CLIPROXY_PORT)
      : (fileConfig.cliproxyPort ?? DEFAULT_PORT);

  if (!Number.isInteger(cliproxyPort) || cliproxyPort < 1 || cliproxyPort > 65535) {
    throw new Error(
      `Invalid CLIPROXY_PORT: ${cliproxyPort} (must be integer 1-65535). ` +
        `Check CLIPROXY_PORT env var or hud-bridge-config.json cliproxyPort field.`,
    );
  }

  return { managementKey, pollIntervalMs, cliproxyPort };
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

/**
 * Perform a GET request to CLIProxy and return the parsed JSON body, or null
 * on any error (connection refused, timeout, non-200, bad JSON).
 *
 * Accepts an optional `fetcher` for dependency injection in tests.
 *
 * @param {string} path  - e.g. "/v0/management/auth-files"
 * @param {string|null} key  - management key (X-Management-Key header), or null
 * @param {number} port  - CLIProxy port
 * @param {Function|null} [fetcher]  - optional injected fetcher (see tests)
 * @returns {Promise<unknown|null>}
 */
export async function fetchJson(path, key, port, fetcher = null) {
  if (fetcher) {
    return fetcher(path, key, port);
  }

  const http = await import("node:http");

  return new Promise((resolve) => {
    const headers = key ? { "X-Management-Key": key } : {};

    const req = http.default.get(
      { host: "127.0.0.1", port, path, headers, timeout: 5_000 },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
        res.on("error", () => resolve(null));
      },
    );

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

// ---------------------------------------------------------------------------
// Sessions counter
// ---------------------------------------------------------------------------

/**
 * Count JSON files in ~/.vein/sessions/ as a proxy for active sessions.
 *
 * @param {Function|null} [readdirFn]  - injected for tests
 * @returns {Promise<number>}
 */
export async function countSessions(readdirFn = null) {
  try {
    const readdir = readdirFn ?? (await import("node:fs/promises")).readdir;
    const files = await readdir(SESSIONS_DIR);
    return files.filter((f) => f.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Auth-files normaliser
// ---------------------------------------------------------------------------

/**
 * Normalise the auth-files response — CLIProxy may return an array directly
 * or an object with a `files` property.
 *
 * @param {unknown} raw
 * @returns {Array<{name?: string, enabled?: boolean}>}
 */
function normaliseAccounts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray(raw.files)) return raw.files;
  return [];
}

/**
 * An account is "online" unless explicitly disabled/unavailable or in a
 * non-active status. Tolerates both the real CLIProxy shape
 * ({ status, disabled, unavailable }) and the legacy { enabled } shape.
 *
 * @param {{enabled?: boolean, disabled?: boolean, unavailable?: boolean, status?: string}} a
 * @returns {boolean}
 */
function isOnline(a) {
  return (
    a.enabled !== false &&
    a.disabled !== true &&
    a.unavailable !== true &&
    (a.status == null || a.status === "active")
  );
}

/**
 * Derive 5-hour / 7-day quota from usage-queue records. CLIProxy stores each
 * upstream response's Anthropic unified rate-limit headers; we read them from
 * the most recent record that carries them. Header values are arrays and
 * Reset is epoch seconds. `api-key-usage` returns {} for OAuth accounts and
 * cannot be used for this.
 *
 * @param {unknown} usageQueueRaw
 * @returns {{activeAuthIndex: string|null, five: {pct: number, reset: string|null}, seven: {pct: number, reset: string|null}}}
 */
export function deriveQuota(usageQueueRaw) {
  const empty = {
    activeAuthIndex: null,
    five: { pct: 0, reset: null },
    seven: { pct: 0, reset: null },
  };
  const recs = Array.isArray(usageQueueRaw) ? usageQueueRaw : [];
  if (recs.length === 0) return empty;

  const hv = (rh, n) => {
    const v = (rh ?? {})[n];
    return Array.isArray(v) ? v[0] : v;
  };
  const UTIL_5H = "Anthropic-Ratelimit-Unified-5h-Utilization";

  // Prefer records that actually carry rate-limit headers; pick the newest.
  const withHdr = recs.filter((r) => hv(r.response_headers, UTIL_5H) != null);
  const pool = withHdr.length > 0 ? withHdr : recs;
  const latest = pool.reduce((a, b) =>
    new Date(b.timestamp ?? 0) >= new Date(a.timestamp ?? 0) ? b : a,
  );

  const rh = latest.response_headers ?? {};
  const toIso = (ep) => {
    const n = Number(ep);
    if (!Number.isFinite(n)) return null;
    return new Date(n > 1e12 ? n : n * 1000).toISOString();
  };
  const pct = (u) => {
    const n = parseFloat(u);
    return Number.isFinite(n) ? Math.round(n * 1000) / 10 : 0;
  };

  return {
    activeAuthIndex: latest.auth_index ?? null,
    five: {
      pct: pct(hv(rh, UTIL_5H)),
      reset: toIso(hv(rh, "Anthropic-Ratelimit-Unified-5h-Reset")),
    },
    seven: {
      pct: pct(hv(rh, "Anthropic-Ratelimit-Unified-7d-Utilization")),
      reset: toIso(hv(rh, "Anthropic-Ratelimit-Unified-7d-Reset")),
    },
  };
}

// ---------------------------------------------------------------------------
// Core poll
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} PollOptions
 * @property {BridgeConfig} config
 * @property {Function|null} [fetcher]   - injected HTTP fetcher (tests)
 * @property {Function|null} [readdirFn] - injected readdir (tests)
 * @property {string} [outputPath]       - override output file path (tests)
 */

/**
 * Perform one poll cycle: fetch CLIProxy data and write external-usage.json.
 *
 * @param {PollOptions} opts
 * @returns {Promise<void>}
 */
export async function poll({ config, fetcher = null, readdirFn = null, outputPath = OUTPUT_PATH }) {
  const { managementKey, cliproxyPort } = config;

  // 1. Auth files → account list + online count
  const authFilesRaw = await fetchJson(
    "/v0/management/auth-files",
    managementKey,
    cliproxyPort,
    fetcher,
  );
  const accounts = normaliseAccounts(authFilesRaw);
  const accountsOnline = accounts.filter(isOnline).length;

  // 2. Usage queue → real per-account quota from Anthropic rate-limit headers.
  //    (api-key-usage returns {} for OAuth accounts, so it cannot be used here.)
  const usageQueueRaw = await fetchJson(
    "/v0/management/usage-queue?count=200",
    managementKey,
    cliproxyPort,
    fetcher,
  );
  const quota = deriveQuota(usageQueueRaw);

  // Active account = the one behind the most recent request, else first online.
  const activeByQuota = quota.activeAuthIndex
    ? accounts.find((a) => a.auth_index === quota.activeAuthIndex)
    : null;
  const firstOnline = accounts.find(isOnline);

  // 3. Active sessions
  const sessionsActive = await countSessions(readdirFn);

  // 4. Carry forward last-known quota when this cycle saw no live request
  //    (idle ≠ 0% — Anthropic quota persists between requests).
  let prev = null;
  try {
    prev = JSON.parse(await readFile(outputPath, "utf8"));
  } catch (err) {
    // Best-effort carry-forward: a missing prior file is normal (first run); for a
    // corrupt/unreadable one, log (don't throw) so the HUD still updates this cycle.
    if (err?.code !== "ENOENT") {
      process.stderr.write(
        `hud-bridge: prior output unreadable at ${outputPath} (${err?.message ?? err}); continuing\n`,
      );
    }
  }

  const fiveHour = quota.five.reset
    ? { used_percentage: quota.five.pct, resets_at: quota.five.reset }
    : (prev?.five_hour ?? { used_percentage: 0, resets_at: null });
  const sevenDay = quota.seven.reset
    ? { used_percentage: quota.seven.pct, resets_at: quota.seven.reset }
    : (prev?.seven_day ?? { used_percentage: 0, resets_at: null });

  const activeAccount =
    activeByQuota?.name ?? firstOnline?.name ?? prev?.active_account ?? "unknown";

  // 5. Build external-usage.json in claude-hud's expected format
  const output = {
    five_hour: fiveHour,
    seven_day: sevenDay,
    balance_label: "Max ∞",
    active_account: activeAccount,
    accounts_online: accountsOnline,
    accounts_total: accounts.length,
    sessions_active: sessionsActive,
    updated_at: new Date().toISOString(),
  };

  // 6. Write — ensure parent directory exists first
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

/**
 * Run the poll loop indefinitely (for PM2 sidecar usage).
 */
async function main() {
  const config = await loadConfig();
  console.log(
    `[hud-bridge] Starting (port=${config.cliproxyPort}, interval=${config.pollIntervalMs}ms)`,
  );

  // Poll immediately on startup, then on the interval.
  while (true) {
    try {
      await poll({ config });
      console.log(`[hud-bridge] Wrote ${OUTPUT_PATH}`);
    } catch (err) {
      console.error(`[hud-bridge] poll error: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, config.pollIntervalMs));
  }
}

// Run when executed directly (`node tools/hud-bridge.mjs`) or under PM2.
// PM2's ESM loader sets process.argv[1] to its own wrapper (not this file),
// so the path heuristic alone fails there. HUD_BRIDGE_MAIN (set in the PM2
// config) makes the intent explicit — we deliberately do NOT key off PM2's
// `pm_id`, so an unrelated PM2-managed process importing this module can't
// auto-start main(). Tests import with none of these set, so main() never starts.
const launchedByPm2 = process.env.HUD_BRIDGE_MAIN === "1";
const isMain =
  launchedByPm2 ||
  (process.argv[1] != null &&
    (process.argv[1].endsWith("hud-bridge.mjs") ||
      new URL(import.meta.url).pathname.endsWith(
        process.argv[1].replace(/\\/g, "/").split("/").pop() ?? "",
      )));

if (isMain) {
  main();
}
