/**
 * Tests for src/lib/manifest.mjs — readManifest + printManifest
 * Wave 10-B: SOTA manifest + --manifest CLI flag
 */

import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { printManifest, readManifest } from "../src/lib/manifest.mjs";

const FIXTURE_CONTENT = `# SOTA Installed Manifest

| Component | Version | Source | Install Command | Purpose |
|-----------|---------|--------|-----------------|---------|
| AO (Agent Orchestrator) | 0.9.2 | github.com/superinit/agent-orchestrator | npm i -g agent-orchestrator | Worktree parallel agent orchestrator |
| Codex CLI | 0.134.0 | npmjs.com/package/@openai/codex | npm i -g @openai/codex | GPT-5.5 xhigh second-model code review |
| CLIProxy | 7.1.24 | github.com/router-for-me/CLIProxyAPI | Go binary release | Subscription-account OAuth routing |
`;

describe("readManifest", () => {
  it("returns string containing AO, Codex, and CLIProxy from default path", async () => {
    const content = await readManifest();
    expect(typeof content).toBe("string");
    expect(content).toContain("AO");
    expect(content).toContain("Codex");
    expect(content).toContain("CLIProxy");
  });

  it("reads from a custom path when provided", async () => {
    const tmpPath = join(tmpdir(), `manifest-test-${Date.now()}.md`);
    await writeFile(tmpPath, FIXTURE_CONTENT, "utf8");
    const content = await readManifest(tmpPath);
    expect(content).toBe(FIXTURE_CONTENT);
  });

  it("throws when the file does not exist", async () => {
    await expect(readManifest("/nonexistent/path/manifest.md")).rejects.toThrow();
  });
});

describe("printManifest", () => {
  it("writes content to the provided out stream and returns 0", async () => {
    const chunks = [];
    const out = { write: (chunk) => chunks.push(chunk) };
    const code = await printManifest({ out });
    expect(code).toBe(0);
    const output = chunks.join("");
    expect(output).toContain("AO");
    expect(output).toContain("Codex");
    expect(output).toContain("CLIProxy");
  });

  it("output contains the table header | Component |", async () => {
    const chunks = [];
    const out = { write: (chunk) => chunks.push(chunk) };
    await printManifest({ out });
    const output = chunks.join("");
    expect(output).toContain("| Component |");
  });

  it("writes to stderr and returns 1 when manifest file is missing", async () => {
    const stderrChunks = [];
    const originalStderr = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => {
      stderrChunks.push(chunk);
      return true;
    };
    try {
      const chunks = [];
      const out = { write: (chunk) => chunks.push(chunk) };
      const code = await printManifest({ out, manifestPath: "/nonexistent/path/manifest.md" });
      expect(code).toBe(1);
      expect(stderrChunks.join("")).toContain("[vein] manifest unavailable:");
    } finally {
      process.stderr.write = originalStderr;
    }
  });

  it("uses process.stdout by default (smoke test — does not crash)", async () => {
    // Just verify the default invocation path doesn't throw;
    // we can't easily capture stdout without monkey-patching here,
    // but we can verify that printManifest() with no args resolves to a number.
    const originalWrite = process.stdout.write.bind(process.stdout);
    const chunks = [];
    process.stdout.write = (chunk) => {
      chunks.push(chunk);
      return true;
    };
    try {
      const code = await printManifest();
      expect(typeof code).toBe("number");
      expect(code).toBe(0);
    } finally {
      process.stdout.write = originalWrite;
    }
  });
});
