/**
 * Tests for tools/hud-bridge.mjs — SP2
 *
 * Dependency injection is used throughout:
 *   - `fetcher` param replaces real HTTP calls
 *   - `readdirFn` param replaces real fs.readdir calls
 *   - `outputPath` param writes to a temp path so tests never touch ~/.vein
 *
 * node:fs/promises (writeFile + mkdir) is mocked via vi.mock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/mock/home"),
}));

const { mkdir, readFile, writeFile } = await import("node:fs/promises");
const { join } = await import("node:path");

// Import after mocks are in place
const { countSessions, fetchJson, loadConfig, OUTPUT_PATH, poll } = await import(
  "../../tools/hud-bridge.mjs"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Use real path.join so separator matches current platform (POSIX vs Windows).
const TEST_OUTPUT = join("/mock/home", ".vein", "hud", "external-usage.json");

/** Build a fetcher that returns `response` for `path`, null for everything else. */
function makeFetcher(responses = {}) {
  return async (path) => responses[path] ?? null;
}

/** Auth-files response with two accounts (first enabled, second disabled). */
const AUTH_FILES_TWO = [
  { name: "primary", enabled: true },
  { name: "secondary", enabled: false },
];

/** Auth-files response with object-wrapper shape (files property). */
const AUTH_FILES_WRAPPED = {
  files: [{ name: "wrapped-acct", enabled: true }],
};

/** Read the JSON that was written by poll(). */
function parsedOutput() {
  const calls = writeFile.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const [, content] = calls[calls.length - 1];
  return JSON.parse(content);
}

// ---------------------------------------------------------------------------
// OUTPUT_PATH
// ---------------------------------------------------------------------------

describe("OUTPUT_PATH", () => {
  it("is rooted under the mock home directory", () => {
    // homedir() is mocked to /mock/home; use join for cross-platform separators.
    expect(OUTPUT_PATH).toBe(join("/mock/home", ".vein", "hud", "external-usage.json"));
  });
});

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------

describe("loadConfig()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MANAGEMENT_PASSWORD;
    delete process.env.CLIPROXY_PORT;
  });

  afterEach(() => {
    delete process.env.MANAGEMENT_PASSWORD;
    delete process.env.CLIPROXY_PORT;
  });

  it("returns null managementKey when env and config file are both absent", async () => {
    readFile.mockRejectedValue(new Error("ENOENT"));

    const cfg = await loadConfig();

    expect(cfg.managementKey).toBeNull();
  });

  it("prefers MANAGEMENT_PASSWORD env var over config file", async () => {
    process.env.MANAGEMENT_PASSWORD = "env-key";
    readFile.mockResolvedValue(JSON.stringify({ managementKey: "file-key" }));

    const cfg = await loadConfig();

    expect(cfg.managementKey).toBe("env-key");
  });

  it("reads managementKey from config file when env var is absent", async () => {
    readFile.mockResolvedValue(JSON.stringify({ managementKey: "file-key" }));

    const cfg = await loadConfig();

    expect(cfg.managementKey).toBe("file-key");
  });

  it("returns default port 8317 when not configured", async () => {
    readFile.mockRejectedValue(new Error("ENOENT"));

    const cfg = await loadConfig();

    expect(cfg.cliproxyPort).toBe(8317);
  });

  it("prefers CLIPROXY_PORT env var over config file port", async () => {
    process.env.CLIPROXY_PORT = "9999";
    readFile.mockResolvedValue(JSON.stringify({ cliproxyPort: 1234 }));

    const cfg = await loadConfig();

    expect(cfg.cliproxyPort).toBe(9999);
  });

  it("returns default pollIntervalMs 30000 when not configured", async () => {
    readFile.mockRejectedValue(new Error("ENOENT"));

    const cfg = await loadConfig();

    expect(cfg.pollIntervalMs).toBe(30_000);
  });
});

// ---------------------------------------------------------------------------
// fetchJson
// ---------------------------------------------------------------------------

describe("fetchJson()", () => {
  it("returns parsed body when injected fetcher resolves with data", async () => {
    const fetcher = async () => ({ accounts: 2 });

    const result = await fetchJson("/v0/management/auth-files", null, 8317, fetcher);

    expect(result).toEqual({ accounts: 2 });
  });

  it("returns null when injected fetcher resolves with null (connection error)", async () => {
    const fetcher = async () => null;

    const result = await fetchJson("/v0/management/auth-files", "key", 8317, fetcher);

    expect(result).toBeNull();
  });

  it("passes path, key, and port to the injected fetcher", async () => {
    const calls = [];
    const fetcher = async (path, key, port) => {
      calls.push({ path, key, port });
      return null;
    };

    await fetchJson("/test-path", "my-key", 1234, fetcher);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ path: "/test-path", key: "my-key", port: 1234 });
  });
});

// ---------------------------------------------------------------------------
// countSessions
// ---------------------------------------------------------------------------

describe("countSessions()", () => {
  it("counts only .json files in the sessions directory", async () => {
    const readdirFn = async () => ["a.json", "b.json", "c.txt", ".gitkeep"];

    const count = await countSessions(readdirFn);

    expect(count).toBe(2);
  });

  it("returns 0 when the sessions directory does not exist", async () => {
    const readdirFn = async () => {
      throw new Error("ENOENT");
    };

    const count = await countSessions(readdirFn);

    expect(count).toBe(0);
  });

  it("returns 0 when the directory is empty", async () => {
    const readdirFn = async () => [];

    const count = await countSessions(readdirFn);

    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// poll()
// ---------------------------------------------------------------------------

describe("poll()", () => {
  const baseConfig = { managementKey: null, cliproxyPort: 8317, pollIntervalMs: 30_000 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes valid JSON with all expected fields", async () => {
    const fetcher = makeFetcher({
      "/v0/management/auth-files": AUTH_FILES_TWO,
    });

    await poll({ config: baseConfig, fetcher, outputPath: TEST_OUTPUT });

    const out = parsedOutput();
    expect(out).toHaveProperty("five_hour");
    expect(out).toHaveProperty("seven_day");
    expect(out).toHaveProperty("balance_label");
    expect(out).toHaveProperty("active_account");
    expect(out).toHaveProperty("accounts_online");
    expect(out).toHaveProperty("accounts_total");
    expect(out).toHaveProperty("sessions_active");
    expect(out).toHaveProperty("updated_at");
  });

  it("creates the parent directory before writing", async () => {
    const fetcher = makeFetcher({ "/v0/management/auth-files": [] });

    await poll({ config: baseConfig, fetcher, outputPath: TEST_OUTPUT });

    expect(mkdir).toHaveBeenCalledWith(join("/mock/home", ".vein", "hud"), { recursive: true });
  });

  it("writes to the provided outputPath", async () => {
    const fetcher = makeFetcher({ "/v0/management/auth-files": [] });

    await poll({ config: baseConfig, fetcher, outputPath: TEST_OUTPUT });

    const [writtenPath] = writeFile.mock.calls[writeFile.mock.calls.length - 1];
    expect(writtenPath).toBe(TEST_OUTPUT);
  });

  it("counts accounts_online correctly (only enabled ones)", async () => {
    const fetcher = makeFetcher({ "/v0/management/auth-files": AUTH_FILES_TWO });

    await poll({ config: baseConfig, fetcher, outputPath: TEST_OUTPUT });

    const out = parsedOutput();
    expect(out.accounts_online).toBe(1); // only "primary" is enabled
    expect(out.accounts_total).toBe(2);
    expect(out.active_account).toBe("primary");
  });

  it("handles object-wrapped auth-files response shape", async () => {
    const fetcher = makeFetcher({ "/v0/management/auth-files": AUTH_FILES_WRAPPED });

    await poll({ config: baseConfig, fetcher, outputPath: TEST_OUTPUT });

    const out = parsedOutput();
    expect(out.accounts_total).toBe(1);
    expect(out.active_account).toBe("wrapped-acct");
  });

  it("produces output with defaults when CLIProxy is unreachable (null responses)", async () => {
    const fetcher = makeFetcher({}); // all paths return null

    await poll({ config: baseConfig, fetcher, outputPath: TEST_OUTPUT });

    const out = parsedOutput();
    expect(out.accounts_online).toBe(0);
    expect(out.accounts_total).toBe(0);
    expect(out.active_account).toBe("unknown");
    expect(out.five_hour.used_percentage).toBe(0);
    expect(out.seven_day.used_percentage).toBe(0);
  });

  it("includes sessions_active from injected readdirFn", async () => {
    const fetcher = makeFetcher({ "/v0/management/auth-files": [] });
    const readdirFn = async () => ["s1.json", "s2.json", "s3.json"];

    await poll({ config: baseConfig, fetcher, readdirFn, outputPath: TEST_OUTPUT });

    const out = parsedOutput();
    expect(out.sessions_active).toBe(3);
  });

  it("uses managementKey from config when making fetch requests", async () => {
    const calls = [];
    const fetcher = async (path, key) => {
      calls.push({ path, key });
      return null;
    };
    const configWithKey = { ...baseConfig, managementKey: "secret-key" };

    await poll({ config: configWithKey, fetcher, outputPath: TEST_OUTPUT });

    // At minimum the auth-files endpoint should have been called with the key
    const authCall = calls.find((c) => c.path === "/v0/management/auth-files");
    expect(authCall).toBeDefined();
    expect(authCall.key).toBe("secret-key");
  });

  it("updated_at is a valid ISO date string", async () => {
    const fetcher = makeFetcher({ "/v0/management/auth-files": [] });

    await poll({ config: baseConfig, fetcher, outputPath: TEST_OUTPUT });

    const out = parsedOutput();
    expect(() => new Date(out.updated_at).toISOString()).not.toThrow();
  });

  it("resets_at timestamps are in the future", async () => {
    const fetcher = makeFetcher({ "/v0/management/auth-files": [] });
    const before = Date.now();

    await poll({ config: baseConfig, fetcher, outputPath: TEST_OUTPUT });

    const out = parsedOutput();
    expect(new Date(out.five_hour.resets_at).getTime()).toBeGreaterThan(before);
    expect(new Date(out.seven_day.resets_at).getTime()).toBeGreaterThan(before);
  });
});
