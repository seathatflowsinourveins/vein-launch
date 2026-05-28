import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Severity } from "../../src/lib/result.mjs";

vi.mock("../../src/lib/shell.mjs", () => ({
  exec: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
}));

const { exec } = await import("../../src/lib/shell.mjs");
const { readdir } = await import("node:fs/promises");
const { check, repair, meta } = await import("../../src/tiers/t2-cliproxy.mjs");

describe("t2-cliproxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("meta", () => {
    it("has correct id t2-cliproxy and name CLIProxy", () => {
      expect(meta.id).toBe("t2-cliproxy");
      expect(meta.name).toBe("CLIProxy");
    });

    it("supports fast, deep, and repair modes", () => {
      expect(meta.modes).toContain("fast");
      expect(meta.modes).toContain("deep");
      expect(meta.modes).toContain("repair");
    });
  });

  describe("check — SKIP cases", () => {
    it("SKIPs when config.cliproxy is undefined (CLIProxy optional)", async () => {
      const result = await check({}, { mode: "fast" });

      expect(result.severity).toBe(Severity.SKIP);
      expect(result.tierId).toBe("t2-cliproxy");
    });

    it("SKIPs when config.cliproxy.hosting is not set", async () => {
      const result = await check({ cliproxy: { port: 8317 } }, { mode: "fast" });

      expect(result.severity).toBe(Severity.SKIP);
      expect(result.tierId).toBe("t2-cliproxy");
    });
  });

  describe("check — fast mode PM2", () => {
    it("PASSes when PM2 process is online", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "status      | online",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const result = await check({ cliproxy: { hosting: "pm2", port: 8317 } }, { mode: "fast" });

      expect(result.severity).toBe(Severity.PASS);
      expect(exec).toHaveBeenCalledWith("pm2 describe cliproxy");
    });

    it("WARNs when PM2 process is not running", async () => {
      exec.mockResolvedValueOnce({
        ok: false,
        stdout: "status      | stopped",
        stderr: "",
        exitCode: 1,
        timedOut: false,
      });

      const result = await check({ cliproxy: { hosting: "pm2", port: 8317 } }, { mode: "fast" });

      expect(result.severity).toBe(Severity.WARN);
      expect(result.evidence[0].remediation).toBeTruthy();
    });
  });

  describe("check — fast mode Docker", () => {
    it("PASSes when Docker container is running", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: '{"State":"running","Name":"cliproxy"}',
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const result = await check({ cliproxy: { hosting: "docker", port: 8317 } }, { mode: "fast" });

      expect(result.severity).toBe(Severity.PASS);
      expect(exec).toHaveBeenCalledWith(
        "wsl docker compose -f ~/docker/cliproxy/compose.yml ps --format json",
      );
    });

    it("WARNs when Docker container is stopped", async () => {
      exec.mockResolvedValueOnce({
        ok: false,
        stdout: '{"State":"exited","Name":"cliproxy"}',
        stderr: "",
        exitCode: 1,
        timedOut: false,
      });

      const result = await check({ cliproxy: { hosting: "docker", port: 8317 } }, { mode: "fast" });

      expect(result.severity).toBe(Severity.WARN);
      expect(result.evidence[0].remediation).toBeTruthy();
    });
  });

  describe("check — deep mode HTTP health", () => {
    it("PASSes when daemon is healthy and auth-dir has OAuth credentials", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "status      | online",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const mockJson = vi.fn().mockResolvedValue({ status: "ok" });
      fetch.mockResolvedValueOnce({ ok: true, json: mockJson });
      readdir.mockResolvedValueOnce([
        { name: "claude-a@example.com.json", isFile: () => true },
        { name: "claude-b@example.com.json", isFile: () => true },
        { name: "codex-c@example.com.json", isFile: () => true },
      ]);

      const result = await check({ cliproxy: { hosting: "pm2", port: 8317 } }, { mode: "deep" });

      expect(result.severity).toBe(Severity.PASS);
      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:8317/healthz",
        expect.objectContaining({ signal: expect.any(Object) }),
      );
      expect(result.evidence.find((e) => e.check === "cliproxy-accounts").actual).toContain(
        "3 OAuth account(s)",
      );
    });

    it("ignores non-file entries and non-credential filenames", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "status      | online",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const mockJson = vi.fn().mockResolvedValue({ status: "ok" });
      fetch.mockResolvedValueOnce({ ok: true, json: mockJson });
      readdir.mockResolvedValueOnce([
        { name: "claude-a@example.com.json", isFile: () => true },
        { name: "logs", isFile: () => false }, // directory — should not count
        { name: "README.md", isFile: () => true }, // not a credential — should not count
        { name: "codex-b@example.com.json", isFile: () => true },
      ]);

      const result = await check({ cliproxy: { hosting: "pm2", port: 8317 } }, { mode: "deep" });

      expect(result.severity).toBe(Severity.PASS);
      expect(result.evidence.find((e) => e.check === "cliproxy-accounts").actual).toContain(
        "2 OAuth account(s)",
      );
    });

    it("PASSes with informational evidence when auth-dir is missing (ENOENT)", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "status      | online",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const mockJson = vi.fn().mockResolvedValue({ status: "ok" });
      fetch.mockResolvedValueOnce({ ok: true, json: mockJson });
      const enoent = Object.assign(new Error("ENOENT: auth-dir missing"), { code: "ENOENT" });
      readdir.mockRejectedValueOnce(enoent);

      const result = await check({ cliproxy: { hosting: "pm2", port: 8317 } }, { mode: "deep" });

      expect(result.severity).toBe(Severity.PASS);
      expect(result.evidence.find((e) => e.check === "cliproxy-accounts").actual).toContain(
        "non-default path",
      );
    });

    it("BLOCKs when auth-dir readdir fails with non-ENOENT (e.g. EACCES)", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "status      | online",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const mockJson = vi.fn().mockResolvedValue({ status: "ok" });
      fetch.mockResolvedValueOnce({ ok: true, json: mockJson });
      const eacces = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      readdir.mockRejectedValueOnce(eacces);

      const result = await check({ cliproxy: { hosting: "pm2", port: 8317 } }, { mode: "deep" });

      expect(result.severity).toBe(Severity.BLOCK);
      const e = result.evidence.find((ev) => ev.check === "cliproxy-accounts");
      expect(e.actual).toContain("EACCES");
      expect(e.remediation).toBeTruthy();
    });

    it("BLOCKs when health endpoint is unreachable (fetch throws)", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "status      | online",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      fetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await check({ cliproxy: { hosting: "pm2", port: 8317 } }, { mode: "deep" });

      expect(result.severity).toBe(Severity.BLOCK);
      expect(result.evidence[0].remediation).toBeTruthy();
    });

    it("BLOCKs when health endpoint returns non-2xx status", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "status      | online",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const mockJson = vi.fn().mockResolvedValue({ status: "error" });
      fetch.mockResolvedValueOnce({ ok: false, status: 503, json: mockJson });

      const result = await check({ cliproxy: { hosting: "pm2", port: 8317 } }, { mode: "deep" });

      expect(result.severity).toBe(Severity.BLOCK);
      expect(result.evidence[0].remediation).toBeTruthy();
    });

    it("BLOCKs when health endpoint returns invalid JSON", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "status      | online",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const mockJson = vi.fn().mockRejectedValue(new SyntaxError("Unexpected token"));
      fetch.mockResolvedValueOnce({ ok: true, status: 200, json: mockJson });

      const result = await check({ cliproxy: { hosting: "pm2", port: 8317 } }, { mode: "deep" });

      expect(result.severity).toBe(Severity.BLOCK);
      expect(result.evidence[0].remediation).toBeTruthy();
    });

    it("WARNs when daemon is healthy but auth-dir is empty (0 OAuth credentials)", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "status      | online",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const mockJson = vi.fn().mockResolvedValue({ status: "ok" });
      fetch.mockResolvedValueOnce({ ok: true, json: mockJson });
      readdir.mockResolvedValueOnce([]);

      const result = await check({ cliproxy: { hosting: "pm2", port: 8317 } }, { mode: "deep" });

      expect(result.severity).toBe(Severity.WARN);
      expect(result.evidence.find((e) => e.check === "cliproxy-accounts").remediation).toBeTruthy();
    });
  });

  describe("repair", () => {
    it("calls pm2 restart for PM2 hosting", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "restarted",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const result = await repair({ cliproxy: { hosting: "pm2" } }, {});

      expect(exec).toHaveBeenCalledWith("pm2 restart cliproxy");
      expect(result.severity).toBe(Severity.PASS);
    });

    it("calls docker compose up for Docker hosting", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "started",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const result = await repair({ cliproxy: { hosting: "docker" } }, {});

      expect(exec).toHaveBeenCalledWith(
        "wsl docker compose -f ~/docker/cliproxy/compose.yml up -d",
      );
      expect(result.severity).toBe(Severity.PASS);
    });

    it("returns SKIP when hosting is not configured", async () => {
      const result = await repair({}, {});

      expect(result.severity).toBe(Severity.SKIP);
      expect(exec).not.toHaveBeenCalled();
    });
  });

  describe("frozen results", () => {
    it("all results are frozen", async () => {
      const result = await check({}, { mode: "fast" });

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.evidence)).toBe(true);
    });
  });
});
