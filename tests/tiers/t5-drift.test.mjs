import { beforeEach, describe, expect, it, vi } from "vitest";
import { Severity } from "../../src/lib/result.mjs";

// Mock node:fs before any module imports
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock node:os
vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/mock/home"),
}));

// Mock shell
vi.mock("../../src/lib/shell.mjs", () => ({
  exec: vi.fn(),
}));

const fs = await import("node:fs");
const { exec } = await import("../../src/lib/shell.mjs");
const { check, repair, meta } = await import("../../src/tiers/t5-drift.mjs");

const deepContext = { mode: "deep" };
const repairContext = { mode: "repair" };

const mockConfig = {
  mcp: {
    pinnedVersions: {
      "github-mcp-server": "1.0.5",
      gitnexus: "1.6.5",
    },
  },
};

/** MCP config with matching versions */
const mcpConfigMatching = JSON.stringify({
  mcpServers: {
    github: {
      command: "C:\\Users\\seath\\bin\\github-mcp-server.exe",
      args: ["--toolsets", "repos,issues,pull_requests"],
    },
    gitnexus: {
      command: "npx",
      args: ["-y", "gitnexus@1.6.5", "mcp-server"],
    },
  },
});

/** MCP config with minor version drift on gitnexus */
const mcpConfigMinorDrift = JSON.stringify({
  mcpServers: {
    gitnexus: {
      command: "npx",
      args: ["-y", "gitnexus@1.6.4", "mcp-server"],
    },
  },
});

/** MCP config with major version drift on gitnexus */
const mcpConfigMajorDrift = JSON.stringify({
  mcpServers: {
    gitnexus: {
      command: "npx",
      args: ["-y", "gitnexus@2.0.0", "mcp-server"],
    },
  },
});

/** MCP config with no pinned servers */
const mcpConfigNoPinned = JSON.stringify({
  mcpServers: {
    "some-other-server": {
      command: "npx",
      args: ["-y", "some-other-server@3.0.0", "start"],
    },
  },
});

/** Valid fresh cache (< 24h old) */
function freshCache(
  severity = Severity.PASS,
  evidence = [{ check: "mcp-drift", actual: "cached" }],
) {
  return JSON.stringify({
    timestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
    severity,
    evidence,
    tierId: "t5-drift",
    tierName: "Drift",
    durationMs: 5,
  });
}

/** Stale cache (> 24h old) */
function staleCache() {
  return JSON.stringify({
    timestamp: Date.now() - 1000 * 60 * 60 * 25, // 25 hours ago
    severity: Severity.PASS,
    evidence: [{ check: "mcp-drift", actual: "stale-cached" }],
    tierId: "t5-drift",
    tierName: "Drift",
    durationMs: 5,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default: no cache, MCP config exists with matching versions
  fs.existsSync.mockImplementation((p) => {
    if (String(p).endsWith("drift-cache.json")) return false;
    if (String(p).endsWith(".mcp.json")) return true;
    return false;
  });
  fs.readFileSync.mockImplementation((p) => {
    if (String(p).endsWith(".mcp.json")) return mcpConfigMatching;
    throw new Error(`Unexpected readFileSync call: ${p}`);
  });
  exec.mockResolvedValue({ ok: true, stdout: "", stderr: "", exitCode: 0, timedOut: false });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. meta
// ─────────────────────────────────────────────────────────────────────────────
describe("meta", () => {
  it("has id t5-drift, name Drift, modes deep and repair", () => {
    expect(meta.id).toBe("t5-drift");
    expect(meta.name).toBe("Drift");
    expect(meta.modes).toContain("deep");
    expect(meta.modes).toContain("repair");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. INFO when ~/.claude/.mcp.json doesn't exist
// ─────────────────────────────────────────────────────────────────────────────
describe("check — no MCP config", () => {
  it("returns INFO when ~/.claude/.mcp.json does not exist", async () => {
    fs.existsSync.mockReturnValue(false);
    const result = await check(mockConfig, deepContext);
    expect(result.severity).toBe(Severity.INFO);
    const ev = result.evidence.find((e) => e.check === "mcp-config");
    expect(ev).toBeDefined();
    expect(ev.actual).toMatch(/no global MCP config/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PASS when all pinned servers match
// ─────────────────────────────────────────────────────────────────────────────
describe("check — all pinned match", () => {
  it("PASSes when all pinned servers match their versions", async () => {
    // github-mcp-server is a binary (no @version in args) → skipped in fast extraction
    // gitnexus@1.6.5 matches pin 1.6.5
    const result = await check(mockConfig, deepContext);
    expect(result.severity).toBe(Severity.PASS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. WARN on minor version drift
// ─────────────────────────────────────────────────────────────────────────────
describe("check — minor version drift", () => {
  it("WARNs when installed minor version is behind pin (1.6.4 vs 1.6.5)", async () => {
    fs.readFileSync.mockImplementation((p) => {
      if (String(p).endsWith(".mcp.json")) return mcpConfigMinorDrift;
      throw new Error(`Unexpected: ${p}`);
    });
    const result = await check(mockConfig, deepContext);
    expect(result.severity).toBe(Severity.WARN);
    const ev = result.evidence.find((e) => e.check === "gitnexus-version");
    expect(ev).toBeDefined();
    expect(ev.remediation).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. BLOCK on major version drift
// ─────────────────────────────────────────────────────────────────────────────
describe("check — major version drift", () => {
  it("BLOCKs when installed major version differs from pin (2.0.0 vs 1.6.5)", async () => {
    fs.readFileSync.mockImplementation((p) => {
      if (String(p).endsWith(".mcp.json")) return mcpConfigMajorDrift;
      throw new Error(`Unexpected: ${p}`);
    });
    const result = await check(mockConfig, deepContext);
    expect(result.severity).toBe(Severity.BLOCK);
    const ev = result.evidence.find((e) => e.check === "gitnexus-version");
    expect(ev).toBeDefined();
    expect(ev.remediation).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Servers without pins are skipped
// ─────────────────────────────────────────────────────────────────────────────
describe("check — no pinned versions for servers", () => {
  it("skips servers that have no entry in mcp.pinnedVersions", async () => {
    fs.readFileSync.mockImplementation((p) => {
      if (String(p).endsWith(".mcp.json")) return mcpConfigNoPinned;
      throw new Error(`Unexpected: ${p}`);
    });
    const result = await check(mockConfig, deepContext);
    // No matching pins → PASS (nothing to check failed)
    expect(result.severity).toBe(Severity.PASS);
    const skipEv = result.evidence.find((e) => e.check === "mcp-pins-skipped");
    expect(skipEv).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Uses fresh cache
// ─────────────────────────────────────────────────────────────────────────────
describe("check — cache", () => {
  it("returns cached result with cacheSource=disk when cache is < 24h old", async () => {
    fs.existsSync.mockImplementation((p) => {
      if (String(p).endsWith("drift-cache.json")) return true;
      if (String(p).endsWith(".mcp.json")) return true;
      return false;
    });
    fs.readFileSync.mockImplementation((p) => {
      if (String(p).endsWith("drift-cache.json")) return freshCache();
      if (String(p).endsWith(".mcp.json")) return mcpConfigMatching;
      throw new Error(`Unexpected: ${p}`);
    });

    const result = await check(mockConfig, deepContext);
    expect(result.cacheSource).toBe("disk");
    expect(result.severity).toBe(Severity.PASS);
    // Should NOT have re-read .mcp.json
    const mcpReadCount = fs.readFileSync.mock.calls.filter((args) =>
      String(args[0]).endsWith(".mcp.json"),
    ).length;
    expect(mcpReadCount).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Ignores stale cache
  // ─────────────────────────────────────────────────────────────────────────
  it("ignores stale cache (> 24h) and re-checks", async () => {
    fs.existsSync.mockImplementation((p) => {
      if (String(p).endsWith("drift-cache.json")) return true;
      if (String(p).endsWith(".mcp.json")) return true;
      return false;
    });
    fs.readFileSync.mockImplementation((p) => {
      if (String(p).endsWith("drift-cache.json")) return staleCache();
      if (String(p).endsWith(".mcp.json")) return mcpConfigMatching;
      throw new Error(`Unexpected: ${p}`);
    });

    const result = await check(mockConfig, deepContext);
    // Stale → re-checked → no cacheSource from disk
    expect(result.cacheSource).toBeUndefined();
    // .mcp.json should have been read
    const mcpReadCount = fs.readFileSync.mock.calls.filter((args) =>
      String(args[0]).endsWith(".mcp.json"),
    ).length;
    expect(mcpReadCount).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 9. Writes new cache after checking
  // ─────────────────────────────────────────────────────────────────────────
  it("writes a new cache file after a live check", async () => {
    // No existing cache
    fs.existsSync.mockImplementation((p) => {
      if (String(p).endsWith("drift-cache.json")) return false;
      if (String(p).endsWith(".mcp.json")) return true;
      return false;
    });
    fs.readFileSync.mockImplementation((p) => {
      if (String(p).endsWith(".mcp.json")) return mcpConfigMatching;
      throw new Error(`Unexpected: ${p}`);
    });

    await check(mockConfig, deepContext);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("drift-cache.json"),
      expect.any(String),
    );
    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(written.timestamp).toBeGreaterThan(0);
    expect(written.severity).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Evidence has remediation for WARN/BLOCK
// ─────────────────────────────────────────────────────────────────────────────
describe("check — remediation fields", () => {
  it("every evidence item has remediation when severity is WARN", async () => {
    fs.readFileSync.mockImplementation((p) => {
      if (String(p).endsWith(".mcp.json")) return mcpConfigMinorDrift;
      throw new Error(`Unexpected: ${p}`);
    });
    const result = await check(mockConfig, deepContext);
    expect(result.severity).toBe(Severity.WARN);
    for (const ev of result.evidence) {
      if (ev.actual !== "pass") {
        expect(ev.remediation).toBeDefined();
      }
    }
  });

  it("every evidence item has remediation when severity is BLOCK", async () => {
    fs.readFileSync.mockImplementation((p) => {
      if (String(p).endsWith(".mcp.json")) return mcpConfigMajorDrift;
      throw new Error(`Unexpected: ${p}`);
    });
    const result = await check(mockConfig, deepContext);
    expect(result.severity).toBe(Severity.BLOCK);
    for (const ev of result.evidence) {
      expect(ev.remediation).toBeDefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. All results are frozen
// ─────────────────────────────────────────────────────────────────────────────
describe("check — frozen results", () => {
  it("returns a frozen TierResult with frozen evidence", async () => {
    const result = await check(mockConfig, deepContext);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.evidence)).toBe(true);
    for (const ev of result.evidence) {
      expect(Object.isFrozen(ev)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. repair() returns WARN with instructions
// ─────────────────────────────────────────────────────────────────────────────
describe("repair", () => {
  it("returns WARN with remediation instructions for each drifted server", async () => {
    fs.readFileSync.mockImplementation((p) => {
      if (String(p).endsWith(".mcp.json")) return mcpConfigMinorDrift;
      throw new Error(`Unexpected: ${p}`);
    });
    const result = await repair(mockConfig, repairContext);
    expect(result.severity).toBe(Severity.WARN);
    expect(Object.isFrozen(result)).toBe(true);
    const ev = result.evidence.find((e) => e.check === "drift-repair");
    expect(ev).toBeDefined();
    expect(ev.remediation).toBeDefined();
  });

  it("returns PASS when no drift detected during repair", async () => {
    const result = await repair(mockConfig, repairContext);
    expect(result.severity).toBe(Severity.PASS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Handles malformed .mcp.json gracefully
// ─────────────────────────────────────────────────────────────────────────────
describe("check — malformed config", () => {
  it("returns WARN when .mcp.json contains invalid JSON", async () => {
    fs.readFileSync.mockImplementation((p) => {
      if (String(p).endsWith(".mcp.json")) return "{ not valid json !!!";
      throw new Error(`Unexpected: ${p}`);
    });
    const result = await check(mockConfig, deepContext);
    expect(result.severity).toBe(Severity.WARN);
    const ev = result.evidence.find((e) => e.check === "mcp-config-parse");
    expect(ev).toBeDefined();
    expect(ev.remediation).toBeDefined();
  });
});
