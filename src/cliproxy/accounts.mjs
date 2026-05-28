import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** @typedef {{ name: string, apiKey: string, addedAt: string, lastUsed: string|null }} Account */
/** @typedef {{ ok: boolean, message: string }} Result */
/** @typedef {{ healthy: string[], unhealthy: string[] }} HealthResult */

const ACCOUNTS_PATH = join(homedir(), ".vein", "accounts.json");
const NAME_RE = /^[a-zA-Z0-9-]{1,50}$/;

/**
 * Read and return all stored accounts.
 * @returns {Account[]}
 */
export function listAccounts() {
  if (!existsSync(ACCOUNTS_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(ACCOUNTS_PATH, "utf8"));
    return Array.isArray(parsed) ? /** @type {Account[]} */ (parsed) : [];
  } catch (err) {
    // A corrupt/partial accounts.json must not crash every account operation.
    process.stderr.write(
      `[vein] WARN: ${ACCOUNTS_PATH} is unreadable or corrupt (${err.message}); treating as empty.\n`,
    );
    return [];
  }
}

/**
 * Persist an updated accounts list to disk.
 * @param {Account[]} accounts
 */
function saveAccounts(accounts) {
  const dir = dirname(ACCOUNTS_PATH);
  mkdirSync(dir, { recursive: true });
  // Atomic write: serialize to a temp file then rename, so a crash mid-write
  // cannot leave a half-written (corrupt) accounts.json behind.
  const tmp = join(dir, `.accounts.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(accounts, null, 2), "utf8");
  renameSync(tmp, ACCOUNTS_PATH);
}

/**
 * Add a new named account.
 * @param {string} name
 * @param {string} apiKey
 * @returns {Result}
 */
export function addAccount(name, apiKey) {
  if (!NAME_RE.test(name)) {
    return {
      ok: false,
      message: `Invalid name "${name}": use alphanumeric and hyphens only, 1–50 chars`,
    };
  }
  if (!apiKey.startsWith("sk-")) {
    return { ok: false, message: "API key must start with 'sk-'" };
  }
  const accounts = listAccounts();
  if (accounts.some((a) => a.name === name)) {
    return { ok: false, message: `Account "${name}" already exists` };
  }
  accounts.push({ name, apiKey, addedAt: new Date().toISOString(), lastUsed: null });
  saveAccounts(accounts);
  return { ok: true, message: `Account "${name}" added` };
}

/**
 * Remove an account by name.
 * @param {string} name
 * @returns {Result}
 */
export function removeAccount(name) {
  const accounts = listAccounts();
  const idx = accounts.findIndex((a) => a.name === name);
  if (idx === -1) {
    return { ok: false, message: `Account "${name}" not found` };
  }
  accounts.splice(idx, 1);
  saveAccounts(accounts);
  return { ok: true, message: `Account "${name}" removed` };
}

/**
 * Retrieve a single account by name.
 * @param {string} name
 * @returns {Account|null}
 */
export function getAccount(name) {
  return listAccounts().find((a) => a.name === name) ?? null;
}

/**
 * Validate API key format for each account. Does not make network calls.
 * @param {Account[]} accounts
 * @returns {HealthResult}
 */
export function healthCheck(accounts) {
  const healthy = /** @type {string[]} */ ([]);
  const unhealthy = /** @type {string[]} */ ([]);
  for (const { name, apiKey } of accounts) {
    if (typeof apiKey === "string" && apiKey.startsWith("sk-")) {
      healthy.push(name);
    } else {
      unhealthy.push(name);
    }
  }
  return { healthy, unhealthy };
}
