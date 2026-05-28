import { createResult, Severity } from "../lib/result.mjs";
import { exec } from "../lib/shell.mjs";

export const meta = { id: "t6-codegraph", name: "CodeGraph", modes: ["deep", "repair"] };

export async function check(config, _context) {
  const start = performance.now();
  const evidence = [];
  const cwd = config?.projectDir;
  const execOpts = cwd ? { cwd } : {};

  const gnVersion = await exec("npx gitnexus@1.6.5 --version", execOpts);
  if (!gnVersion.ok) {
    evidence.push({ check: "gitnexus-available", actual: "gitnexus not available via npx" });
    return createResult({
      tierId: meta.id,
      tierName: meta.name,
      severity: Severity.SKIP,
      evidence,
      durationMs: performance.now() - start,
    });
  }

  const status = await exec("npx gitnexus@1.6.5 status", execOpts);
  if (!status.ok) {
    evidence.push({ check: "gitnexus-index", actual: "repo not indexed" });
    return createResult({
      tierId: meta.id,
      tierName: meta.name,
      severity: Severity.INFO,
      evidence,
      durationMs: performance.now() - start,
    });
  }

  if (status.stdout.includes("stale") || status.stdout.includes("commitsAhead")) {
    evidence.push({
      check: "gitnexus-freshness",
      actual: "index is stale — will reindex post-launch",
    });
    return createResult({
      tierId: meta.id,
      tierName: meta.name,
      severity: Severity.INFO,
      evidence,
      durationMs: performance.now() - start,
      diagnostics: { stale: true, triggerReindex: true },
    });
  }

  evidence.push({ check: "gitnexus", actual: `indexed, fresh (${gnVersion.stdout.trim()})` });
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: Severity.PASS,
    evidence,
    durationMs: performance.now() - start,
  });
}

export async function repair(config, _context) {
  const start = performance.now();
  const cwd = config?.projectDir;
  const execOpts = cwd ? { cwd } : {};
  const result = await exec("npx gitnexus@1.6.5 analyze", execOpts);
  return createResult({
    tierId: meta.id,
    tierName: meta.name,
    severity: result.ok ? Severity.PASS : Severity.BLOCK,
    evidence: [
      result.ok
        ? {
            check: "gitnexus-reindex",
            actual: "reindex triggered successfully",
          }
        : {
            check: "gitnexus-reindex",
            actual: "gitnexus analyze failed",
            remediation: "Run `npx gitnexus@1.6.5 analyze` manually to reindex the repository",
          },
    ],
    durationMs: performance.now() - start,
  });
}
