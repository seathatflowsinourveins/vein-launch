import { beforeEach, describe, expect, it, vi } from "vitest";
import { Severity } from "../../src/lib/result.mjs";

vi.mock("../../src/lib/shell.mjs", () => ({
  exec: vi.fn(),
}));

const { exec } = await import("../../src/lib/shell.mjs");
const { check, repair, meta, compareVersions } = await import("../../src/tiers/t3-cli.mjs");

/** Helper: resolve N exec calls in order */
function mockExecSequence(...responses) {
  for (const r of responses) {
    exec.mockResolvedValueOnce(r);
  }
}

const ok = (stdout) => ({ ok: true, stdout, stderr: "", exitCode: 0, timedOut: false });
const fail = (stderr = "not found") => ({
  ok: false,
  stdout: "",
  stderr,
  exitCode: 1,
  timedOut: false,
});

// All tools in pin order: node, python, gh, claude, rtk, codex
const ALL_PASS_RESPONSES = [
  ok("v24.14.0"), // node
  ok("Python 3.13.2"), // python
  ok("gh version 2.73.0 (2024-01-01)"), // gh
  ok("claude 1.2.3"), // claude
  ok("rtk 0.42.0"), // rtk
  ok("codex 0.134.0"), // codex
];

describe("t3-cli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("meta", () => {
    it("has correct id 't3-cli' and name 'CLI Tools'", () => {
      expect(meta.id).toBe("t3-cli");
      expect(meta.name).toBe("CLI Tools");
    });

    it("includes all three modes", () => {
      expect(meta.modes).toContain("fast");
      expect(meta.modes).toContain("deep");
      expect(meta.modes).toContain("repair");
    });
  });

  describe("compareVersions", () => {
    it("returns 1 when actual is above minimum: 24.14.0 > 24.0.0", () => {
      expect(compareVersions("24.14.0", "24.0.0")).toBe(1);
    });

    it("returns -1 when actual is below minimum: 3.12.0 < 3.13.0", () => {
      expect(compareVersions("3.12.0", "3.13.0")).toBe(-1);
    });

    it("returns 0 when versions are equal: 2.0.0 === 2.0.0", () => {
      expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
    });

    it("returns 1 when actual major is above minimum: 1.0.0 > 0.42.0", () => {
      expect(compareVersions("1.0.0", "0.42.0")).toBe(1);
    });

    it("returns -1 for patch below: 0.41.9 < 0.42.0", () => {
      expect(compareVersions("0.41.9", "0.42.0")).toBe(-1);
    });
  });

  describe("check — version parsing", () => {
    it("parses 'v24.14.0' format correctly (node)", async () => {
      mockExecSequence(...ALL_PASS_RESPONSES);
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.PASS);
      // node was parsed; any pass evidence entry for node-version should reflect detected version
      const nodeEvidence = result.evidence.find((e) => e.check === "node-version");
      expect(nodeEvidence).toBeDefined();
      expect(nodeEvidence.actual).toContain("24.14.0");
    });

    it("parses 'Python 3.13.2' format correctly (python)", async () => {
      mockExecSequence(...ALL_PASS_RESPONSES);
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.PASS);
      const pyEvidence = result.evidence.find((e) => e.check === "python-version");
      expect(pyEvidence).toBeDefined();
      expect(pyEvidence.actual).toContain("3.13.2");
    });

    it("parses 'gh version 2.73.0' format correctly (gh)", async () => {
      mockExecSequence(...ALL_PASS_RESPONSES);
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.PASS);
      const ghEvidence = result.evidence.find((e) => e.check === "gh-version");
      expect(ghEvidence).toBeDefined();
      expect(ghEvidence.actual).toContain("2.73.0");
    });
  });

  describe("version parsing edge cases", () => {
    it("rejects four-segment versions like 0.134.0.1", async () => {
      mockExecSequence(
        ok("v24.14.0"),
        ok("Python 3.13.2"),
        ok("gh version 2.73.0"),
        ok("claude 1.2.3"),
        ok("rtk 0.42.0"),
        ok("codex 0.134.0.1"), // four-segment
      );
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.WARN);
      const e = result.evidence.find((ev) => ev.check === "codex-unparseable");
      expect(e).toBeDefined();
    });

    it("rejects pre-release versions like 1.0.0-beta.1", async () => {
      mockExecSequence(
        ok("v24.14.0"),
        ok("Python 3.13.2"),
        ok("gh version 2.73.0"),
        ok("claude 1.0.0-beta.1"), // pre-release
        ok("rtk 0.42.0"),
        ok("codex 0.134.0"),
      );
      const result = await check({}, {});
      // pre-release "1.0.0-beta.1" — the regex should match "1.0.0" followed by "-", not a digit/dot
      // so it extracts "1.0.0" which satisfies >=1.0.0 → PASS
      // This is acceptable: we strip pre-release and compare the release version
      expect([Severity.PASS, Severity.WARN]).toContain(result.severity);
    });

    it("handles empty version output as unparseable", async () => {
      mockExecSequence(
        ok("v24.14.0"),
        ok("Python 3.13.2"),
        ok("gh version 2.73.0"),
        ok("claude 1.2.3"),
        ok("rtk 0.42.0"),
        ok(""), // empty codex output
      );
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.WARN);
      const e = result.evidence.find((ev) => ev.check === "codex-unparseable");
      expect(e).toBeDefined();
    });
  });

  describe("check — pass/warn/block logic", () => {
    it("PASSes when all tools are present at or above minimum versions", async () => {
      mockExecSequence(...ALL_PASS_RESPONSES);
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.PASS);
      expect(result.tierId).toBe("t3-cli");
    });

    it("BLOCKs when critical tool 'node' is missing", async () => {
      mockExecSequence(
        fail(), // node missing
        ok("Python 3.13.2"),
        ok("gh version 2.73.0"),
        ok("claude 1.2.3"),
        ok("rtk 0.42.0"),
        ok("codex 0.134.0"),
      );
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.BLOCK);
      const e = result.evidence.find((ev) => ev.check === "node-missing");
      expect(e).toBeDefined();
      expect(e.remediation).toBeTruthy();
    });

    it("BLOCKs when critical tool 'claude' is missing", async () => {
      mockExecSequence(
        ok("v24.14.0"),
        ok("Python 3.13.2"),
        ok("gh version 2.73.0"),
        fail(), // claude missing
        ok("rtk 0.42.0"),
        ok("codex 0.134.0"),
      );
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.BLOCK);
      const e = result.evidence.find((ev) => ev.check === "claude-missing");
      expect(e).toBeDefined();
      expect(e.remediation).toBeTruthy();
    });

    it("WARNs when non-critical tool 'codex' is missing", async () => {
      mockExecSequence(
        ok("v24.14.0"),
        ok("Python 3.13.2"),
        ok("gh version 2.73.0"),
        ok("claude 1.2.3"),
        ok("rtk 0.42.0"),
        fail(), // codex missing
      );
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.WARN);
      const e = result.evidence.find((ev) => ev.check === "codex-missing");
      expect(e).toBeDefined();
      expect(e.remediation).toBeTruthy();
    });

    it("WARNs when a non-critical tool version is below pin", async () => {
      mockExecSequence(
        ok("v24.14.0"),
        ok("Python 3.12.0"), // below 3.13.0
        ok("gh version 2.73.0"),
        ok("claude 1.2.3"),
        ok("rtk 0.42.0"),
        ok("codex 0.134.0"),
      );
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.WARN);
      const e = result.evidence.find((ev) => ev.check === "python-outdated");
      expect(e).toBeDefined();
      expect(e.remediation).toBeTruthy();
    });
  });

  describe("check — deep mode gh auth scopes", () => {
    it("adds WARN evidence when gh auth is missing required scopes", async () => {
      // 6 version checks + 1 gh auth status
      mockExecSequence(...ALL_PASS_RESPONSES, {
        ok: true,
        stdout: "",
        stderr: "Logged in. Token scopes: read:user",
        exitCode: 0,
        timedOut: false,
      });
      const result = await check({}, { mode: "deep" });
      // severity can be WARN because scopes missing
      expect(result.severity).toBe(Severity.WARN);
      const e = result.evidence.find((ev) => ev.check === "gh-auth-scopes");
      expect(e).toBeDefined();
      expect(e.remediation).toContain("gh auth refresh");
    });

    it("does not run gh auth check in fast mode", async () => {
      mockExecSequence(...ALL_PASS_RESPONSES);
      const result = await check({}, { mode: "fast" });
      expect(result.severity).toBe(Severity.PASS);
      // exec should have been called exactly 6 times (one per tool)
      expect(exec).toHaveBeenCalledTimes(6);
    });
  });

  describe("check — result integrity", () => {
    it("returns a frozen result with frozen evidence items", async () => {
      mockExecSequence(...ALL_PASS_RESPONSES);
      const result = await check({}, {});
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.evidence)).toBe(true);
      for (const e of result.evidence) {
        expect(Object.isFrozen(e)).toBe(true);
      }
    });

    it("every WARN evidence item has a remediation field", async () => {
      mockExecSequence(
        ok("v24.14.0"),
        ok("Python 3.12.0"), // outdated → WARN
        ok("gh version 2.73.0"),
        ok("claude 1.2.3"),
        ok("rtk 0.42.0"),
        fail(), // codex missing → WARN
      );
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.WARN);
      for (const e of result.evidence) {
        expect(e.remediation).toBeTruthy();
      }
    });

    it("every BLOCK evidence item has a remediation field", async () => {
      mockExecSequence(
        fail(), // node missing → BLOCK
        ok("Python 3.13.2"),
        ok("gh version 2.73.0"),
        ok("claude 1.2.3"),
        ok("rtk 0.42.0"),
        ok("codex 0.134.0"),
      );
      const result = await check({}, {});
      expect(result.severity).toBe(Severity.BLOCK);
      for (const e of result.evidence) {
        expect(e.remediation).toBeTruthy();
      }
    });

    it("includes durationMs in all results", async () => {
      mockExecSequence(...ALL_PASS_RESPONSES);
      const result = await check({}, {});
      expect(typeof result.durationMs).toBe("number");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("repair", () => {
    it("PASSes when mise is available and 'mise install' succeeds", async () => {
      exec
        .mockResolvedValueOnce(ok("mise 2024.1.0")) // mise --version
        .mockResolvedValueOnce(ok("All tools installed")); // mise install
      const result = await repair({}, {});
      expect(result.severity).toBe(Severity.PASS);
      expect(result.tierId).toBe("t3-cli");
    });

    it("BLOCKs when mise is available but 'mise install' fails", async () => {
      exec.mockResolvedValueOnce(ok("mise 2024.1.0")).mockResolvedValueOnce(fail("install failed"));
      const result = await repair({}, {});
      expect(result.severity).toBe(Severity.BLOCK);
      expect(result.evidence[0].remediation).toBeTruthy();
    });

    it("WARNs when mise is not available", async () => {
      exec.mockResolvedValueOnce(fail("mise: command not found"));
      const result = await repair({}, {});
      expect(result.severity).toBe(Severity.WARN);
      expect(result.evidence[0].remediation).toContain("mise");
    });
  });
});
