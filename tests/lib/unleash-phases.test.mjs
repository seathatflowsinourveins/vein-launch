/**
 * Tests for unleashPhase schema validation and launchClaude phase behavior.
 *
 * launchClaude uses execSync internally, so we mock the entire exec.mjs module
 * and test only the exported helpers (buildLaunchArgs is sync and testable
 * once we expose the phase-aware version).
 *
 * For the allow-populated warning path we test the exported helper directly.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Schema validation — uses the same mock as config.test.mjs to strip $schema
// ---------------------------------------------------------------------------

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    readFileSync: (path, encoding) => {
      const raw = original.readFileSync(path, encoding);
      if (typeof raw === "string" && raw.includes('"$schema"') && raw.includes("json-schema.org")) {
        const parsed = JSON.parse(raw);
        const { $schema: _dropped, ...rest } = parsed;
        return JSON.stringify(rest);
      }
      return raw;
    },
  };
});

import { validateProjectConfig } from "../../src/lib/config.mjs";

describe("unleashPhase schema validation", () => {
  it('accepts unleashPhase "default"', () => {
    const result = validateProjectConfig({ project: "p", unleashPhase: "default" });
    expect(result.valid).toBe(true);
  });

  it('accepts unleashPhase "allow-populated"', () => {
    const result = validateProjectConfig({ project: "p", unleashPhase: "allow-populated" });
    expect(result.valid).toBe(true);
  });

  it('accepts unleashPhase "bypass"', () => {
    const result = validateProjectConfig({ project: "p", unleashPhase: "bypass" });
    expect(result.valid).toBe(true);
  });

  it("rejects an invalid unleashPhase value", () => {
    const result = validateProjectConfig({ project: "p", unleashPhase: "full-auto" });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/unleashPhase/i);
  });

  it("accepts config without unleashPhase (optional field)", () => {
    const result = validateProjectConfig({ project: "p" });
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildLaunchArgs phase behavior (async version via buildLaunchArgsAsync)
// ---------------------------------------------------------------------------

let tmpDir;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `vein-phase-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// Helper: write a qualifying run
async function writeQualifyingRun(dir) {
  const results = Array.from({ length: 7 }, (_, i) => ({ tier: `t${i}`, severity: "PASS" }));
  await writeFile(join(dir, "qualifying.json"), JSON.stringify({ results }), "utf8");
}

import { buildLaunchArgsAsync } from "../../src/lib/exec.mjs";

describe("buildLaunchArgsAsync phase behavior", () => {
  it("phase=default: no --dangerously-skip-permissions flag", async () => {
    const args = await buildLaunchArgsAsync({ unleashPhase: "default" }, [], { runsDir: tmpDir });
    expect(args).not.toContain("--dangerously-skip-permissions");
  });

  it("phase=allow-populated: includes --dangerously-skip-permissions", async () => {
    const args = await buildLaunchArgsAsync({ unleashPhase: "allow-populated" }, [], {
      runsDir: tmpDir,
    });
    expect(args).toContain("--dangerously-skip-permissions");
  });

  it("phase=bypass + qualifying run: includes --dangerously-skip-permissions", async () => {
    await writeQualifyingRun(tmpDir);
    const args = await buildLaunchArgsAsync({ unleashPhase: "bypass" }, [], { runsDir: tmpDir });
    expect(args).toContain("--dangerously-skip-permissions");
  });

  it("phase=bypass + no qualifying run: downgrades to allow-populated, includes flag", async () => {
    // No qualifying run — bypass gate downgrades to allow-populated
    const args = await buildLaunchArgsAsync({ unleashPhase: "bypass" }, [], { runsDir: tmpDir });
    expect(args).toContain("--dangerously-skip-permissions");
  });

  it("pass-through args are appended after flags", async () => {
    await writeQualifyingRun(tmpDir);
    const args = await buildLaunchArgsAsync(
      { unleashPhase: "bypass" },
      ["--model", "claude-opus-4-5"],
      { runsDir: tmpDir },
    );
    expect(args).toContain("--dangerously-skip-permissions");
    expect(args).toContain("--model");
    expect(args).toContain("claude-opus-4-5");
  });

  it("defaults to phase=default when unleashPhase is absent from config", async () => {
    const args = await buildLaunchArgsAsync({}, [], { runsDir: tmpDir });
    expect(args).not.toContain("--dangerously-skip-permissions");
  });
});

// ---------------------------------------------------------------------------
// allow-populated warning path — checkAllowList
// ---------------------------------------------------------------------------

import { checkAllowList } from "../../src/lib/exec.mjs";

describe("checkAllowList", () => {
  it("returns {ok:true} when settings.json has a non-empty permissions.allow array", async () => {
    const settingsDir = join(tmpDir, ".claude");
    await mkdir(settingsDir, { recursive: true });
    await writeFile(
      join(settingsDir, "settings.json"),
      JSON.stringify({ permissions: { allow: ["Bash(git:*)", "Read"] } }),
      "utf8",
    );
    const result = await checkAllowList(tmpDir);
    expect(result.ok).toBe(true);
  });

  it("returns {ok:false, reason} when settings.json is missing", async () => {
    const result = await checkAllowList(tmpDir);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/settings\.json/);
  });

  it("returns {ok:false, reason} when permissions.allow is empty array", async () => {
    const settingsDir = join(tmpDir, ".claude");
    await mkdir(settingsDir, { recursive: true });
    await writeFile(
      join(settingsDir, "settings.json"),
      JSON.stringify({ permissions: { allow: [] } }),
      "utf8",
    );
    const result = await checkAllowList(tmpDir);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/empty/i);
  });

  it("returns {ok:false, reason} when permissions key is absent", async () => {
    const settingsDir = join(tmpDir, ".claude");
    await mkdir(settingsDir, { recursive: true });
    await writeFile(
      join(settingsDir, "settings.json"),
      JSON.stringify({ someOtherKey: true }),
      "utf8",
    );
    const result = await checkAllowList(tmpDir);
    expect(result.ok).toBe(false);
  });
});
