import { beforeEach, describe, expect, it, vi } from "vitest";
import { Severity } from "../../src/lib/result.mjs";

vi.mock("../../src/lib/shell.mjs", () => ({
  exec: vi.fn(),
}));

const { exec } = await import("../../src/lib/shell.mjs");
const { check, repair, meta } = await import("../../src/tiers/t6-codegraph.mjs");

const ok = (stdout) => ({ ok: true, stdout, stderr: "", exitCode: 0, timedOut: false });
const fail = (stderr = "") => ({ ok: false, stdout: "", stderr, exitCode: 1, timedOut: false });

describe("t6-codegraph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("meta", () => {
    it("has id 't6-codegraph' and name 'CodeGraph'", () => {
      expect(meta.id).toBe("t6-codegraph");
      expect(meta.name).toBe("CodeGraph");
    });

    it("meta.modes includes both 'deep' and 'repair'", () => {
      expect(meta.modes).toContain("deep");
      expect(meta.modes).toContain("repair");
    });
  });

  describe("check — SKIP when gitnexus not installed", () => {
    it("returns SKIP when gitnexus --version fails", async () => {
      exec.mockResolvedValueOnce(fail("gitnexus: not found"));
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.SKIP);
      expect(result.tierId).toBe("t6-codegraph");
    });

    it("SKIP result has evidence describing unavailability", async () => {
      exec.mockResolvedValueOnce(fail("gitnexus: not found"));
      const result = await check({}, {});
      const e = result.evidence.find((ev) => ev.check === "gitnexus-available");
      expect(e).toBeDefined();
      expect(e.actual).toMatch(/not available/i);
    });
  });

  describe("check — INFO when repo not indexed", () => {
    it("returns INFO when gitnexus status exits non-zero", async () => {
      exec
        .mockResolvedValueOnce(ok("gitnexus 1.6.5")) // --version succeeds
        .mockResolvedValueOnce(fail("not indexed")); // status fails
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.INFO);
    });

    it("INFO result has evidence check 'gitnexus-index'", async () => {
      exec.mockResolvedValueOnce(ok("gitnexus 1.6.5")).mockResolvedValueOnce(fail("not indexed"));
      const result = await check({}, {});
      const e = result.evidence.find((ev) => ev.check === "gitnexus-index");
      expect(e).toBeDefined();
      expect(e.actual).toBe("repo not indexed");
    });
  });

  describe("check — INFO when index is stale", () => {
    it("returns INFO when status stdout contains 'stale'", async () => {
      exec
        .mockResolvedValueOnce(ok("gitnexus 1.6.5"))
        .mockResolvedValueOnce(ok("index is stale: 3 commits behind"));
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.INFO);
    });

    it("returns INFO when status stdout contains 'commitsAhead'", async () => {
      exec.mockResolvedValueOnce(ok("gitnexus 1.6.5")).mockResolvedValueOnce(ok("commitsAhead: 5"));
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.INFO);
    });

    it("stale result has diagnostics.stale = true", async () => {
      exec.mockResolvedValueOnce(ok("gitnexus 1.6.5")).mockResolvedValueOnce(ok("index is stale"));
      const result = await check({}, {});
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics.stale).toBe(true);
    });

    it("stale result has diagnostics.triggerReindex = true", async () => {
      exec.mockResolvedValueOnce(ok("gitnexus 1.6.5")).mockResolvedValueOnce(ok("commitsAhead: 2"));
      const result = await check({}, {});
      expect(result.diagnostics.triggerReindex).toBe(true);
    });
  });

  describe("check — PASS when index is fresh", () => {
    it("returns PASS when status is ok and no stale/commitsAhead keyword", async () => {
      exec
        .mockResolvedValueOnce(ok("gitnexus 1.6.5"))
        .mockResolvedValueOnce(ok("index up to date, 0 commits behind"));
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.PASS);
    });

    it("PASS evidence includes version from --version output", async () => {
      exec
        .mockResolvedValueOnce(ok("gitnexus 1.6.5"))
        .mockResolvedValueOnce(ok("index up to date"));
      const result = await check({}, {});
      const e = result.evidence.find((ev) => ev.check === "gitnexus");
      expect(e).toBeDefined();
      expect(e.actual).toContain("gitnexus 1.6.5");
    });
  });

  describe("check — result integrity", () => {
    it("all results are frozen objects", async () => {
      exec.mockResolvedValueOnce(fail());
      const result = await check({}, {});
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.evidence)).toBe(true);
      for (const e of result.evidence) {
        expect(Object.isFrozen(e)).toBe(true);
      }
    });

    it("durationMs is a non-negative number", async () => {
      exec.mockResolvedValueOnce(ok("gitnexus 1.6.5")).mockResolvedValueOnce(ok("up to date"));
      const result = await check({}, {});
      expect(typeof result.durationMs).toBe("number");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("repair", () => {
    it("calls gitnexus analyze", async () => {
      exec.mockResolvedValueOnce(ok("analyze complete"));
      await repair({}, {});
      expect(exec).toHaveBeenCalledWith(expect.stringContaining("gitnexus"), expect.anything());
      expect(exec).toHaveBeenCalledWith(expect.stringContaining("analyze"), expect.anything());
    });

    it("returns PASS on successful analyze", async () => {
      exec.mockResolvedValueOnce(ok("analyze complete"));
      const result = await repair({}, {});
      expect(result.severity).toBe(Severity.PASS);
      expect(result.tierId).toBe("t6-codegraph");
    });

    it("returns BLOCK on failed analyze", async () => {
      exec.mockResolvedValueOnce(fail("analyze failed: could not connect"));
      const result = await repair({}, {});
      expect(result.severity).toBe(Severity.BLOCK);
    });

    it("BLOCK result has a remediation on the evidence item", async () => {
      exec.mockResolvedValueOnce(fail("analyze failed"));
      const result = await repair({}, {});
      expect(result.evidence[0].remediation).toBeTruthy();
    });

    it("repair result is frozen", async () => {
      exec.mockResolvedValueOnce(ok("done"));
      const result = await repair({}, {});
      expect(Object.isFrozen(result)).toBe(true);
    });
  });
});
