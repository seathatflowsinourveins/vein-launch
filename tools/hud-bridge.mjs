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

  // 1. Auth files → account list
  const authFilesRaw = await fetchJson(
    "/v0/management/auth-files",
    managementKey,
    cliproxyPort,
    fetcher,
  );
  const accounts = normaliseAccounts(authFilesRaw);
  const accountsOnline = accounts.filter((a) => a.enabled !== false).length;
  const activeAccount = accounts.find((a) => a.enabled !== false)?.name ?? "unknown";

  // 2. API-key usage (best-effort; may not exist on all CLIProxy builds)
  const usageRaw = await fetchJson(
    "/v0/management/api-key-usage",
    managementKey,
    cliproxyPort,
    fetcher,
  );

  // Derive percentage from usage object if available; default to 0.
  const fiveHourPct = usageRaw?.five_hour_pct ?? 0;
  const sevenDayPct = usageRaw?.seven_day_pct ?? 0;

  // 3. Active sessions
  const sessionsActive = await countSessions(readdirFn);

  // 4. Build external-usage.json in claude-hud's expected format
  const now = Date.now();
  const output = {
    five_hour: {
      used_percentage: fiveHourPct,
      resets_at: new Date(now + 5 * 3_600_000).toISOString(),
    },
    seven_day: {
      used_percentage: sevenDayPct,
      resets_at: new Date(now + 7 * 86_400_000).toISOString(),
    },
    balance_label: "Max ∞",
    active_account: activeAccount,
    accounts_online: accountsOnline,
    accounts_total: accounts.length,
    sessions_active: sessionsActive,
    updated_at: new Date(now).toISOString(),
  };

  // 5. Write — ensure parent directory exists first
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

// Run when executed directly (not when imported by tests)
const isMain =
  process.argv[1] != null &&
  (process.argv[1].endsWith("hud-bridge.mjs") ||
    new URL(import.meta.url).pathname.endsWith(
      process.argv[1].replace(/\\/g, "/").split("/").pop() ?? "",
    ));

if (isMain) {
  main();
}
