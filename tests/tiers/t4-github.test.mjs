import { beforeEach, describe, expect, it, vi } from "vitest";
import { Severity } from "../../src/lib/result.mjs";

vi.mock("../../src/lib/shell.mjs", () => ({
  exec: vi.fn(),
}));

const { exec } = await import("../../src/lib/shell.mjs");
const { check, repair, meta } = await import("../../src/tiers/t4-github.mjs");

const ok = (stdout) => ({ ok: true, stdout, stderr: "", exitCode: 0, timedOut: false });
const fail = (stderr = "") => ({ ok: false, stdout: "", stderr, exitCode: 1, timedOut: false });

/** gh auth status output with all required scopes */
const AUTH_ALL_SCOPES =
  "Logged in to github.com as user (oauth_token)\nToken scopes: repo, workflow, security_events, read:org";

/** gh auth status output missing workflow and security_events */
const _AUTH_MISSING_SCOPES =
  "Logged in to github.com as user (oauth_token)\nToken scopes: repo, read:org";

describe("t4-github", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Test 1: meta shape ---
  describe("meta", () => {
    it("has id 't4-github', name 'GitHub', modes deep and repair", () => {
      expect(meta.id).toBe("t4-github");
      expect(meta.name).toBe("GitHub");
      expect(meta.modes).toContain("deep");
      expect(meta.modes).toContain("repair");
      expect(meta.modes).not.toContain("fast");
    });
  });

  // --- Test 2: all passing ---
  describe("check — all passing", () => {
    it("PASSes when all scopes present and SSH signing configured", async () => {
      exec
        .mockResolvedValueOnce(ok(AUTH_ALL_SCOPES)) // gh auth status
        .mockResolvedValueOnce(ok("ssh")) // git config gpg.format
        .mockResolvedValueOnce(ok("~/.ssh/id_ed25519.pub")); // git config user.signingkey

      const result = await check({}, { mode: "deep" });

      expect(result.severity).toBe(Severity.PASS);
      expect(result.tierId).toBe("t4-github");
    });
  });

  // --- Test 3: missing repo scope ---
  describe("check — auth scope failures", () => {
    it("BLOCKs when gh auth scopes missing (repo missing)", async () => {
      exec
        .mockResolvedValueOnce(ok("Token scopes: workflow, security_events")) // gh auth status
        .mockResolvedValueOnce(ok("ssh")) // git config gpg.format
        .mockResolvedValueOnce(ok("~/.ssh/id_ed25519.pub")); // git config user.signingkey

      const result = await check({}, { mode: "deep" });

      expect(result.severity).toBe(Severity.BLOCK);
      expect(result.evidence.some((e) => e.check === "gh-auth-scopes")).toBe(true);
      const scopeEvidence = result.evidence.find((e) => e.check === "gh-auth-scopes");
      expect(scopeEvidence.remediation).toBeTruthy();
      expect(scopeEvidence.remediation).toContain("gh auth refresh");
    });

    // --- Test 4: not authenticated at all ---
    it("BLOCKs when gh auth fails entirely (not authenticated)", async () => {
      exec
        .mockResolvedValueOnce(fail("You are not logged into any GitHub hosts. Run gh auth login")) // gh auth status
        .mockResolvedValueOnce(ok("ssh")) // git config gpg.format
        .mockResolvedValueOnce(ok("~/.ssh/id_ed25519.pub")); // git config user.signingkey

      const result = await check({}, { mode: "deep" });

      expect(result.severity).toBe(Severity.BLOCK);
      const authEvidence = result.evidence.find((e) => e.check === "gh-auth-login");
      expect(authEvidence).toBeDefined();
      expect(authEvidence.remediation).toContain("gh auth login");
    });
  });

  // --- Test 5: gpg.format not ssh ---
  describe("check — SSH signing warnings", () => {
    it("WARNs when SSH signing gpg.format is not 'ssh'", async () => {
      exec
        .mockResolvedValueOnce(ok(AUTH_ALL_SCOPES)) // gh auth status
        .mockResolvedValueOnce(ok("openpgp")) // git config gpg.format
        .mockResolvedValueOnce(ok("~/.ssh/id_ed25519.pub")); // git config user.signingkey

      const result = await check({}, { mode: "deep" });

      expect(result.severity).toBe(Severity.WARN);
      const sigEvidence = result.evidence.find((e) => e.check === "git-signing-format");
      expect(sigEvidence).toBeDefined();
      expect(sigEvidence.remediation).toContain("gpg.format ssh");
    });

    // --- Test 6: signing key not configured ---
    it("WARNs when signing key not configured", async () => {
      exec
        .mockResolvedValueOnce(ok(AUTH_ALL_SCOPES)) // gh auth status
        .mockResolvedValueOnce(ok("ssh")) // git config gpg.format
        .mockResolvedValueOnce(fail("")); // git config user.signingkey — not set

      const result = await check({}, { mode: "deep" });

      expect(result.severity).toBe(Severity.WARN);
      const keyEvidence = result.evidence.find((e) => e.check === "git-signing-key");
      expect(keyEvidence).toBeDefined();
      expect(keyEvidence.remediation).toContain("user.signingkey");
    });

    // --- Test 7: scopes ok but SSH missing doesn't BLOCK ---
    it("WARNs (not BLOCKs) when scopes ok but SSH signing not configured", async () => {
      exec
        .mockResolvedValueOnce(ok(AUTH_ALL_SCOPES)) // gh auth status
        .mockResolvedValueOnce(fail("")) // git config gpg.format — not set
        .mockResolvedValueOnce(fail("")); // git config user.signingkey — not set

      const result = await check({}, { mode: "deep" });

      expect(result.severity).toBe(Severity.WARN);
      expect(result.severity).not.toBe(Severity.BLOCK);
    });
  });

  // --- Test 8: evidence has remediation for WARN/BLOCK ---
  describe("check — evidence integrity", () => {
    it("all WARN/BLOCK evidence items have remediation", async () => {
      exec
        .mockResolvedValueOnce(fail("not logged in"))
        .mockResolvedValueOnce(fail(""))
        .mockResolvedValueOnce(fail(""));

      const result = await check({}, { mode: "deep" });

      // BLOCK takes precedence, filter for only the returned evidence
      for (const e of result.evidence) {
        if (result.severity === Severity.BLOCK || result.severity === Severity.WARN) {
          expect(e.remediation).toBeTruthy();
        }
      }
    });

    // --- Test 9: results are frozen ---
    it("all results are frozen", async () => {
      exec
        .mockResolvedValueOnce(ok(AUTH_ALL_SCOPES))
        .mockResolvedValueOnce(ok("ssh"))
        .mockResolvedValueOnce(ok("~/.ssh/id_ed25519.pub"));

      const result = await check({}, { mode: "deep" });

      expect(Object.isFrozen(result)).toBe(true);
      for (const e of result.evidence) {
        expect(Object.isFrozen(e)).toBe(true);
      }
    });

    // --- Test 10: durationMs is non-negative ---
    it("durationMs is a non-negative number", async () => {
      exec
        .mockResolvedValueOnce(ok(AUTH_ALL_SCOPES))
        .mockResolvedValueOnce(ok("ssh"))
        .mockResolvedValueOnce(ok("~/.ssh/id_ed25519.pub"));

      const result = await check({}, { mode: "deep" });

      expect(typeof result.durationMs).toBe("number");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // --- Tests 11 & 12: repair ---
  describe("repair", () => {
    // --- Test 11: repair calls gh auth refresh ---
    it("repair calls gh auth refresh", async () => {
      exec
        .mockResolvedValueOnce(ok("")) // gh auth refresh
        .mockResolvedValueOnce(ok("ssh")) // git config gpg.format (already set)
        .mockResolvedValueOnce(ok("~/.ssh/id_ed25519.pub")); // git config user.signingkey (already set)

      const result = await repair({}, {});

      expect(exec).toHaveBeenCalledWith("gh auth refresh -s repo,workflow,security_events");
      expect(result.tierId).toBe("t4-github");
    });

    // --- Test 12: repair configures SSH signing ---
    it("repair configures SSH signing when not configured", async () => {
      exec
        .mockResolvedValueOnce(ok("")) // gh auth refresh
        .mockResolvedValueOnce(fail("")) // git config gpg.format — not set
        .mockResolvedValueOnce(fail("")); // git config user.signingkey — not set

      // repair sets gpg.format
      exec
        .mockResolvedValueOnce(ok("")) // git config --global gpg.format ssh
        .mockResolvedValueOnce(ok("")); // git config --global user.signingkey ...

      const result = await repair({}, {});

      const calls = exec.mock.calls.map((c) => c[0]);
      expect(calls.some((c) => c.includes("gpg.format ssh"))).toBe(true);
      expect(result.tierId).toBe("t4-github");
    });

    // --- Test 13: repair fails closed when gh auth refresh fails ---
    it("repair BLOCKs (fail-closed) when gh auth refresh fails", async () => {
      exec.mockResolvedValueOnce(fail("HTTP 401: Bad credentials")); // gh auth refresh fails

      const result = await repair({}, {});

      expect(result.severity).toBe(Severity.BLOCK);
      const e = result.evidence.find((ev) => ev.check === "gh-auth-refresh");
      expect(e).toBeDefined();
      expect(e.actual).toContain("gh auth refresh failed");
      expect(e.remediation).toContain("gh auth login");
      // must short-circuit before the SSH signing checks
      expect(exec).toHaveBeenCalledTimes(1);
    });
  });
});
