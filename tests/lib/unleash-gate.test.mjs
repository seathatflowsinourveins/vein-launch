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

/** Build a results array with 6 PASS + 1 WARN */
function mixedResults() {
  const results = passResults(6);
  results.push({ tier: "t6", severity: "WARN" });
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

  it("downgrades when a run has 6 PASS + 1 WARN (not all-PASS)", async () => {
    await writeRun("run1.json", { results: mixedResults() });
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
    await writeRun("run2.json", { results: mixedResults() });
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
});
