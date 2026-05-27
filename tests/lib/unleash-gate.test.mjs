/**
 * Tests for src/lib/unleash-gate.mjs
 * Covers resolveUnleashPhase auto-gate logic with injected runsDir.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveUnleashPhase } from "../../src/lib/unleash-gate.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `vein-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

/** Write a JSON run file into tmpDir */
async function writeRun(name, data) {
  await writeFile(join(tmpDir, name), JSON.stringify(data), "utf8");
}

/** Build a results array of N PASS entries */
function passResults(n) {
  return Array.from({ length: n }, (_, i) => ({ tier: `t${i}`, severity: "PASS" }));
}

/** Build a results array with 6 PASS + 1 WARN (non-fatal mix — both are operable) */
function mixedPassWarn() {
  const results = passResults(6);
  results.push({ tier: "t6", severity: "WARN" });
  return results;
}

/** Build a results array with 6 PASS + 1 BLOCK (fatal mix) */
function blockResults() {
  const results = passResults(6);
  results.push({ tier: "t6", severity: "block" });
  return results;
}

// ---------------------------------------------------------------------------
// configPhase = "default" — always pass through unchanged
// ---------------------------------------------------------------------------

describe("configPhase=default", () => {
  it("returns {phase:'default', downgraded:false} regardless of runsDir", async () => {
    const result = await resolveUnleashPhase({ configPhase: "default", runsDir: tmpDir });
    expect(result).toEqual({ phase: "default", downgraded: false });
  });
});

// ---------------------------------------------------------------------------
// configPhase = "allow-populated" — always pass through unchanged
// ---------------------------------------------------------------------------

describe("configPhase=allow-populated", () => {
  it("returns {phase:'allow-populated', downgraded:false}", async () => {
    const result = await resolveUnleashPhase({ configPhase: "allow-populated", runsDir: tmpDir });
    expect(result).toEqual({ phase: "allow-populated", downgraded: false });
  });
});

// ---------------------------------------------------------------------------
// configPhase = "bypass" — gate logic
// ---------------------------------------------------------------------------

describe("configPhase=bypass", () => {
  it("returns bypass when runsDir has a qualifying run (all 7 tiers PASS)", async () => {
    await writeRun("run1.json", { results: passResults(7) });
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result).toEqual({ phase: "bypass", downgraded: false });
  });

  it("downgrades to allow-populated when runsDir does not exist", async () => {
    const nonExistent = join(tmpDir, "no-such-dir");
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: nonExistent });
    expect(result.phase).toBe("allow-populated");
    expect(result.downgraded).toBe(true);
    expect(result.reason).toMatch(/bypass requires/);
  });

  it("downgrades when runsDir is empty (no run files)", async () => {
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("allow-populated");
    expect(result.downgraded).toBe(true);
  });

  it("downgrades when runs exist but none are all-PASS (7 tiers)", async () => {
    await writeRun("run1.json", { results: passResults(4) });
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("allow-populated");
    expect(result.downgraded).toBe(true);
  });

  it("downgrades when a run has exactly 6 PASS entries (needs >= 7)", async () => {
    await writeRun("run1.json", { results: passResults(6) });
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("allow-populated");
    expect(result.downgraded).toBe(true);
  });

  it("downgrades when a run has 6 PASS + 1 BLOCK (fatal severity disqualifies)", async () => {
    await writeRun("run1.json", { results: blockResults() });
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("allow-populated");
    expect(result.downgraded).toBe(true);
  });

  it("skips malformed JSON files and still finds qualifying run", async () => {
    await writeFile(join(tmpDir, "corrupt.json"), "{{not-valid-json", "utf8");
    await writeRun("good.json", { results: passResults(7) });
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("bypass");
    expect(result.downgraded).toBe(false);
  });

  it("skips malformed JSON files and downgrades when no qualifying run", async () => {
    await writeFile(join(tmpDir, "corrupt.json"), "{{not-valid-json", "utf8");
    await writeRun("bad.json", { results: passResults(3) });
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("allow-populated");
    expect(result.downgraded).toBe(true);
  });

  it("ignores non-.json files in runsDir", async () => {
    await writeFile(join(tmpDir, "run.txt"), JSON.stringify({ results: passResults(7) }), "utf8");
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("allow-populated");
    expect(result.downgraded).toBe(true);
  });

  it("returns bypass when at least one qualifying run exists among many", async () => {
    await writeRun("run1.json", { results: passResults(3) });
    await writeRun("run2.json", { results: blockResults() });
    await writeRun("run3.json", { results: passResults(7) });
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("bypass");
    expect(result.downgraded).toBe(false);
  });

  it("qualifying run with more than 7 PASS entries is accepted", async () => {
    await writeRun("run1.json", { results: passResults(10) });
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("bypass");
    expect(result.downgraded).toBe(false);
  });

  // ---- production format: persist.mjs writes `tiers` field with lowercase severity ----

  it("accepts production format: tiers field + lowercase severity + mode=deep", async () => {
    await writeRun("run1.json", {
      project: "vein-launch",
      mode: "deep",
      tiers: Array.from({ length: 7 }, (_, i) => ({ tierId: `t${i}`, severity: "pass" })),
    });
    const result = await resolveUnleashPhase({
      configPhase: "bypass",
      runsDir: tmpDir,
      project: "vein-launch",
    });
    expect(result.phase).toBe("bypass");
    expect(result.downgraded).toBe(false);
  });

  // ---- project filter: cross-project run does NOT qualify when caller specifies project ----

  it("rejects runs from a different project when caller specifies project filter", async () => {
    await writeRun("run1.json", {
      project: "other-project",
      mode: "deep",
      tiers: Array.from({ length: 7 }, (_, i) => ({ tierId: `t${i}`, severity: "pass" })),
    });
    const result = await resolveUnleashPhase({
      configPhase: "bypass",
      runsDir: tmpDir,
      project: "vein-launch",
    });
    expect(result.phase).toBe("allow-populated");
    expect(result.downgraded).toBe(true);
  });

  // ---- mode filter: fast-mode runs do NOT qualify ----

  it("rejects fast-mode runs (only deep mode qualifies)", async () => {
    await writeRun("run1.json", {
      project: "vein-launch",
      mode: "fast",
      tiers: Array.from({ length: 7 }, (_, i) => ({ tierId: `t${i}`, severity: "pass" })),
    });
    const result = await resolveUnleashPhase({
      configPhase: "bypass",
      runsDir: tmpDir,
      project: "vein-launch",
    });
    expect(result.phase).toBe("allow-populated");
    expect(result.downgraded).toBe(true);
  });

  // ---- Wave 10.5-A: non-fatal severity semantics ----

  it("accepts run with mixed non-fatal severities (PASS, WARN)", async () => {
    await writeRun("run1.json", { results: mixedPassWarn() });
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("bypass");
    expect(result.downgraded).toBe(false);
  });

  it("rejects run containing any BLOCK severity", async () => {
    await writeRun("run1.json", {
      results: [
        { tier: "t0", severity: "pass" },
        { tier: "t1", severity: "pass" },
        { tier: "t2", severity: "pass" },
        { tier: "t3", severity: "block" },
        { tier: "t4", severity: "pass" },
        { tier: "t5", severity: "pass" },
        { tier: "t6", severity: "pass" },
      ],
    });
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("allow-populated");
    expect(result.downgraded).toBe(true);
  });

  it("rejects run containing any ERROR severity", async () => {
    await writeRun("run1.json", {
      results: [
        { tier: "t0", severity: "pass" },
        { tier: "t1", severity: "pass" },
        { tier: "t2", severity: "pass" },
        { tier: "t3", severity: "pass" },
        { tier: "t4", severity: "error" },
        { tier: "t5", severity: "pass" },
        { tier: "t6", severity: "pass" },
      ],
    });
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("allow-populated");
    expect(result.downgraded).toBe(true);
  });

  it("case-insensitive: uppercase BLOCK rejected, uppercase ERROR rejected", async () => {
    await writeRun("block-upper.json", {
      results: Array.from({ length: 6 }, (_, i) => ({ tier: `t${i}`, severity: "pass" })).concat([
        { tier: "t6", severity: "BLOCK" },
      ]),
    });
    const blockResult = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(blockResult.phase).toBe("allow-populated");

    await rm(join(tmpDir, "block-upper.json"));
    await writeRun("error-upper.json", {
      results: Array.from({ length: 6 }, (_, i) => ({ tier: `t${i}`, severity: "pass" })).concat([
        { tier: "t6", severity: "ERROR" },
      ]),
    });
    const errorResult = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(errorResult.phase).toBe("allow-populated");
  });

  it("production-realistic mix: T0=pass T1=info T2=skip T3=warn T4=warn T5=info T6=pass → bypass qualifies", async () => {
    await writeRun("prod-run.json", {
      mode: "deep",
      tiers: [
        { tierId: "t0-rtk", severity: "pass" },
        { tierId: "t1-env", severity: "info" },
        { tierId: "t2-cliproxy", severity: "skip" },
        { tierId: "t3-config", severity: "warn" },
        { tierId: "t4-github", severity: "warn" },
        { tierId: "t5-docker", severity: "info" },
        { tierId: "t6-network", severity: "pass" },
      ],
    });
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("bypass");
    expect(result.downgraded).toBe(false);
  });

  // ---- Wave 10.5 review: allow-list fails closed on null/undefined/unknown severity ----

  it("rejects run containing a tier with null severity (fails closed)", async () => {
    await writeRun("null-sev.json", {
      results: Array.from({ length: 6 }, (_, i) => ({ tier: `t${i}`, severity: "pass" })).concat([
        { tier: "t6", severity: null },
      ]),
    });
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("allow-populated");
    expect(result.downgraded).toBe(true);
  });

  it("rejects run containing a tier with undefined severity (missing field)", async () => {
    await writeRun("missing-sev.json", {
      results: Array.from({ length: 6 }, (_, i) => ({ tier: `t${i}`, severity: "pass" })).concat([
        { tier: "t6" }, // severity field omitted entirely
      ]),
    });
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("allow-populated");
    expect(result.downgraded).toBe(true);
  });

  it("rejects run containing a tier with unknown severity string", async () => {
    await writeRun("unknown-sev.json", {
      results: Array.from({ length: 6 }, (_, i) => ({ tier: `t${i}`, severity: "pass" })).concat([
        { tier: "t6", severity: "mystery" },
      ]),
    });
    const result = await resolveUnleashPhase({ configPhase: "bypass", runsDir: tmpDir });
    expect(result.phase).toBe("allow-populated");
    expect(result.downgraded).toBe(true);
  });
});
