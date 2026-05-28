#!/usr/bin/env node
/**
 * worktree-cleanup.mjs — safe removal of stale `agent-*` worktrees.
 *
 * Background: parallel-agent runs spawn isolated worktrees under
 * `.claude/worktrees/agent-<hash>/`. When agents finish, the runtime
 * leaves the worktrees `[locked]` so `git worktree prune` won't clean
 * them — which is intentional (prevents losing uncommitted work) but
 * accumulates GB of disk over time.
 *
 * Safety guards (all enforced by default):
 *   1. Resolve `parent` against the repo root and verify it stays under
 *      that root (prevents accidental cross-repo or absolute-path damage).
 *   2. Per-worktree dirty-skip via `git status --porcelain`.
 *   3. Per-worktree staleness check — skip anything younger than
 *      `minAgeMs` (default: 1 hour) so we cannot clobber a currently
 *      running agent that just happens to be temporarily clean.
 *   4. `git worktree remove` is invoked WITHOUT `--force`. If a worktree
 *      becomes dirty between the `isClean()` check and remove (TOCTOU),
 *      git refuses the remove and we record it as skipped rather than
 *      silently losing work.
 *
 * Usage:
 *   node tools/worktree-cleanup.mjs            # dry-run (default)
 *   node tools/worktree-cleanup.mjs --execute  # actually remove
 *
 *   # Programmatic:
 *   import { cleanupWorktrees } from "./tools/worktree-cleanup.mjs";
 *   await cleanupWorktrees({ execute: true, minAgeMs: 3600_000 });
 */

import { execFile } from "node:child_process";
import { readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const WORKTREE_PARENT = ".claude/worktrees";
const AGENT_PREFIX = "agent-";
const DEFAULT_MIN_AGE_MS = 60 * 60 * 1000;

async function dirSize(path) {
  let total = 0;
  async function walk(p) {
    let entries;
    try {
      entries = await readdir(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(p, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        try {
          const s = await stat(full);
          total += s.size;
        } catch {
          /* skip unreadable */
        }
      }
    }
  }
  await walk(path);
  return total;
}

function fmtBytes(n) {
  if (n > 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n > 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n > 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

async function getRepoRoot(cwd = process.cwd()) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Resolve `parent` (relative or absolute) to an absolute realpath under `root`.
 * Returns null when parent escapes root or cannot be resolved. Uses
 * path.relative() so the check is robust across platform separators
 * (Windows backslash vs POSIX forward-slash) and symlinks.
 */
async function resolveSafeParent(parent, root) {
  const candidate = isAbsolute(parent) ? parent : join(root, parent);
  let real;
  try {
    real = await realpath(candidate);
  } catch {
    return null;
  }
  const realRoot = await realpath(root).catch(() => root);
  const rel = relative(realRoot, real);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return null;
  }
  return real;
}

async function dirAgeMs(path) {
  try {
    const s = await stat(path);
    return Date.now() - s.mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

async function isClean(worktreePath) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", worktreePath, "status", "--porcelain"]);
    return stdout.trim() === "";
  } catch {
    return false;
  }
}

/**
 * Unlock (if locked) then remove the worktree without --force.
 * Git refuses removal when the worktree is dirty — that refusal is the
 * race-condition guard. Caller treats throws as "skipped".
 */
async function unlockAndRemove(worktreePath) {
  try {
    await execFileAsync("git", ["worktree", "unlock", worktreePath]);
  } catch (err) {
    const msg = (err.stderr ?? err.message ?? "").toString();
    if (!/not locked/i.test(msg)) throw err;
  }
  await execFileAsync("git", ["worktree", "remove", worktreePath]);
}

export async function cleanupWorktrees({
  execute = false,
  parent = WORKTREE_PARENT,
  minAgeMs = DEFAULT_MIN_AGE_MS,
  repoRoot = null,
} = {}) {
  const root = repoRoot ?? (await getRepoRoot());
  if (!root) {
    return {
      error: "Not inside a git repository — cannot resolve repo root",
      removed: [],
      skipped: [],
      dryRun: !execute,
    };
  }
  const resolvedParent = await resolveSafeParent(parent, root);
  if (!resolvedParent) {
    return {
      error: `Refusing to operate on parent="${parent}" — escapes repo root or cannot be resolved`,
      removed: [],
      skipped: [],
      dryRun: !execute,
    };
  }

  let entries;
  try {
    entries = await readdir(resolvedParent, { withFileTypes: true });
  } catch (err) {
    return {
      error: `Cannot read ${resolvedParent}: ${err.message}`,
      removed: [],
      skipped: [],
      dryRun: !execute,
    };
  }
  const candidates = entries
    .filter((e) => e.isDirectory() && e.name.startsWith(AGENT_PREFIX))
    .map((e) => join(resolvedParent, e.name));

  const removed = [];
  const skipped = [];

  for (const wt of candidates) {
    const size = await dirSize(wt);
    const ageMs = await dirAgeMs(wt);
    if (ageMs < minAgeMs) {
      skipped.push({
        path: wt,
        size,
        reason: `too recent (mtime ${Math.round(ageMs / 1000)}s old; threshold ${Math.round(minAgeMs / 1000)}s — likely active agent)`,
      });
      continue;
    }
    const clean = await isClean(wt);
    if (!clean) {
      skipped.push({ path: wt, size, reason: "uncommitted changes (dirty)" });
      continue;
    }
    if (execute) {
      try {
        await unlockAndRemove(wt);
        removed.push({ path: wt, size, action: "removed" });
      } catch (err) {
        const detail = (err.stderr ?? err.message ?? "").toString().split("\n")[0];
        skipped.push({
          path: wt,
          size,
          reason: `remove refused (likely race-dirty): ${detail.slice(0, 120)}`,
        });
      }
    } else {
      removed.push({ path: wt, size, action: "would-remove" });
    }
  }

  return { removed, skipped, dryRun: !execute };
}

function printReport(result) {
  if (result.error) {
    console.error(`error: ${result.error}`);
    process.exitCode = 1;
    return;
  }
  const mode = result.dryRun ? "DRY-RUN" : "EXECUTE";
  console.log(`worktree-cleanup [${mode}]`);
  console.log(`  candidates: ${result.removed.length + result.skipped.length}`);
  console.log(`  ${result.dryRun ? "would-remove" : "removed"}: ${result.removed.length}`);
  console.log(`  skipped:    ${result.skipped.length}`);
  const reclaimed = result.removed.reduce((s, r) => s + r.size, 0);
  console.log(`  ${result.dryRun ? "would-reclaim" : "reclaimed"}: ${fmtBytes(reclaimed)}`);
  if (result.skipped.length) {
    console.log("\n  skipped (kept on disk):");
    for (const s of result.skipped) {
      console.log(`    - ${s.path} (${fmtBytes(s.size)}): ${s.reason}`);
    }
  }
  if (result.dryRun && result.removed.length) {
    console.log("\n  Re-run with --execute to remove the listed worktrees.");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const execute = process.argv.includes("--execute");
  const result = await cleanupWorktrees({ execute });
  printReport(result);
}
