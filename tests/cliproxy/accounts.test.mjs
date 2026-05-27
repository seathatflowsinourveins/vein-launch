import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/mock/home"),
}));

const { existsSync, readFileSync, writeFileSync } = await import("node:fs");
const { join } = await import("node:path");
const { listAccounts, addAccount, removeAccount, getAccount, healthCheck } = await import(
  "../../src/cliproxy/accounts.mjs"
);

// Use the real path.join so the separator matches the current platform.
const MOCK_ACCOUNTS_PATH = join("/mock/home", ".vein", "accounts.json");

/** @returns {import("../../src/cliproxy/accounts.mjs").Account} */
function makeAccount(name, apiKey = "sk-ant-valid-key") {
  return { name, apiKey, addedAt: "2026-01-01T00:00:00.000Z", lastUsed: null };
}

describe("accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- listAccounts ----

  describe("listAccounts", () => {
    it("returns empty array when accounts file does not exist", () => {
      existsSync.mockReturnValue(false);

      const result = listAccounts();

      expect(result).toEqual([]);
      expect(existsSync).toHaveBeenCalledWith(MOCK_ACCOUNTS_PATH);
    });

    it("returns parsed accounts when file exists", () => {
      const accounts = [makeAccount("acct-1"), makeAccount("acct-2")];
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(accounts));

      const result = listAccounts();

      expect(result).toEqual(accounts);
      expect(readFileSync).toHaveBeenCalledWith(MOCK_ACCOUNTS_PATH, "utf8");
    });
  });

  // ---- addAccount ----

  describe("addAccount", () => {
    it("adds account to an empty list and writes file", () => {
      existsSync.mockReturnValue(false);

      const result = addAccount("my-acct", "sk-ant-key-123");

      expect(result.ok).toBe(true);
      expect(writeFileSync).toHaveBeenCalledOnce();
      const written = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(written).toHaveLength(1);
      expect(written[0].name).toBe("my-acct");
      expect(written[0].apiKey).toBe("sk-ant-key-123");
      expect(written[0].lastUsed).toBeNull();
      expect(typeof written[0].addedAt).toBe("string");
    });

    it("rejects duplicate account name", () => {
      const accounts = [makeAccount("existing")];
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(accounts));

      const result = addAccount("existing", "sk-ant-new-key");

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/already exists/i);
      expect(writeFileSync).not.toHaveBeenCalled();
    });

    it("rejects name with special characters", () => {
      existsSync.mockReturnValue(false);

      const result = addAccount("invalid name!", "sk-ant-key");

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/invalid name/i);
      expect(writeFileSync).not.toHaveBeenCalled();
    });

    it("rejects apiKey not starting with 'sk-'", () => {
      existsSync.mockReturnValue(false);

      const result = addAccount("valid-name", "bad-key");

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/api key must start with/i);
      expect(writeFileSync).not.toHaveBeenCalled();
    });

    it("rejects name longer than 50 characters", () => {
      existsSync.mockReturnValue(false);

      const result = addAccount("a".repeat(51), "sk-ant-key");

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/invalid name/i);
    });

    it("accepts hyphenated names", () => {
      existsSync.mockReturnValue(false);

      const result = addAccount("claude-prod-1", "sk-ant-key-abc");

      expect(result.ok).toBe(true);
    });
  });

  // ---- removeAccount ----

  describe("removeAccount", () => {
    it("removes an existing account and writes updated list", () => {
      const accounts = [makeAccount("to-remove"), makeAccount("keep-me")];
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(accounts));

      const result = removeAccount("to-remove");

      expect(result.ok).toBe(true);
      expect(writeFileSync).toHaveBeenCalledOnce();
      const written = JSON.parse(writeFileSync.mock.calls[0][1]);
      expect(written).toHaveLength(1);
      expect(written[0].name).toBe("keep-me");
    });

    it("returns error when account name does not exist", () => {
      const accounts = [makeAccount("only-acct")];
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(accounts));

      const result = removeAccount("ghost");

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/not found/i);
      expect(writeFileSync).not.toHaveBeenCalled();
    });
  });

  // ---- getAccount ----

  describe("getAccount", () => {
    it("returns matching account by name", () => {
      const accounts = [makeAccount("find-me"), makeAccount("other")];
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(accounts));

      const result = getAccount("find-me");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("find-me");
    });

    it("returns null when account name does not exist", () => {
      const accounts = [makeAccount("only-one")];
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(JSON.stringify(accounts));

      const result = getAccount("missing");

      expect(result).toBeNull();
    });
  });

  // ---- healthCheck ----

  describe("healthCheck", () => {
    it("classifies accounts with valid sk- keys as healthy and invalid keys as unhealthy", () => {
      const accounts = [
        makeAccount("good-1", "sk-ant-valid"),
        makeAccount("good-2", "sk-prod-xyz"),
        makeAccount("bad-1", "not-an-sk-key"),
        makeAccount("bad-2", ""),
      ];

      const result = healthCheck(accounts);

      expect(result.healthy).toEqual(["good-1", "good-2"]);
      expect(result.unhealthy).toEqual(["bad-1", "bad-2"]);
    });

    it("returns all healthy when all keys are valid", () => {
      const accounts = [makeAccount("a", "sk-key-1"), makeAccount("b", "sk-key-2")];

      const { healthy, unhealthy } = healthCheck(accounts);

      expect(healthy).toHaveLength(2);
      expect(unhealthy).toHaveLength(0);
    });

    it("returns all unhealthy when no keys are valid", () => {
      const accounts = [makeAccount("x", "bad"), makeAccount("y", "also-bad")];

      const { healthy, unhealthy } = healthCheck(accounts);

      expect(healthy).toHaveLength(0);
      expect(unhealthy).toHaveLength(2);
    });

    it("handles empty accounts array", () => {
      const { healthy, unhealthy } = healthCheck([]);

      expect(healthy).toHaveLength(0);
      expect(unhealthy).toHaveLength(0);
    });
  });
});
