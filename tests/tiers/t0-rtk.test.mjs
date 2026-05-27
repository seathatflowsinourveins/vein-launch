import { beforeEach, describe, expect, it, vi } from "vitest";
import { Severity } from "../../src/lib/result.mjs";

vi.mock("../../src/lib/shell.mjs", () => ({
  exec: vi.fn(),
}));

const { exec } = await import("../../src/lib/shell.mjs");
const { check, repair, meta } = await import("../../src/tiers/t0-rtk.mjs");

describe("t0-rtk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("meta", () => {
    it("has correct id and name", () => {
      expect(meta.id).toBe("t0-rtk");
      expect(meta.name).toBe("RTK");
    });

    it("supports all three modes", () => {
      expect(meta.modes).toContain("fast");
      expect(meta.modes).toContain("deep");
      expect(meta.modes).toContain("repair");
    });
  });

  describe("check", () => {
    it("BLOCKs when rtk binary is not on PATH", async () => {
      exec.mockResolvedValueOnce({
        ok: false,
        stdout: "",
        stderr: "not found",
        exitCode: 1,
        timedOut: false,
      });

      const result = await check({}, {});

      expect(result.severity).toBe(Severity.BLOCK);
      expect(result.tierId).toBe("t0-rtk");
      expect(result.evidence[0].check).toBe("rtk-binary");
      expect(result.evidence[0].remediation).toBeTruthy();
    });

    it("WARNs when rtk version is outdated", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "rtk 0.40.3",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const result = await check({}, {});

      expect(result.severity).toBe(Severity.WARN);
      expect(result.evidence[0].check).toBe("rtk-version");
      expect(result.evidence[0].actual).toContain("0.40");
    });

    it("WARNs when rtk init --show fails (hook/injection not configured)", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "rtk 0.42.0",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });
      exec.mockResolvedValueOnce({
        ok: false,
        stdout: "",
        stderr: "not initialized",
        exitCode: 1,
        timedOut: false,
      });

      const result = await check({}, {});

      expect(result.severity).toBe(Severity.WARN);
    });

    it("PASSes when rtk is correct version and configured", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "rtk 0.42.0",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });
      const initOutput =
        process.platform === "win32" ? "CLAUDE.md injection active" : "hook mode active";
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: initOutput,
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const result = await check({}, {});

      expect(result.severity).toBe(Severity.PASS);
      expect(result.tierId).toBe("t0-rtk");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("returns frozen result with frozen evidence", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "rtk 0.42.0",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });
      const initOutput =
        process.platform === "win32" ? "CLAUDE.md injection active" : "hook mode active";
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: initOutput,
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const result = await check({}, {});

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.evidence)).toBe(true);
    });

    it("includes durationMs in all results", async () => {
      exec.mockResolvedValueOnce({
        ok: false,
        stdout: "",
        stderr: "",
        exitCode: 1,
        timedOut: false,
      });

      const result = await check({}, {});

      expect(typeof result.durationMs).toBe("number");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("repair", () => {
    it("returns PASS when rtk init succeeds", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "initialized",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const result = await repair({}, {});

      expect(result.severity).toBe(Severity.PASS);
      expect(result.tierId).toBe("t0-rtk");
    });

    it("returns BLOCK when rtk init fails", async () => {
      exec.mockResolvedValueOnce({
        ok: false,
        stdout: "",
        stderr: "permission denied",
        exitCode: 1,
        timedOut: false,
      });

      const result = await repair({}, {});

      expect(result.severity).toBe(Severity.BLOCK);
      expect(result.evidence[0].remediation).toBeTruthy();
    });
  });
});
