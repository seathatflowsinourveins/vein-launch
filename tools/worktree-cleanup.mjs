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
 * This script reverses that decision SAFELY:
 *   1. Enumerate all `.claude/worktrees/agent-*` worktrees.
 *   2. For each, `git -C <path> status --porcelain`. Skip if non-empty
 *      (uncommitted changes — agent may not have finished).
 *   3. For clean worktrees, `git worktree unlock` + `git worktree remove
 *      --force` to release them. Branch refs are intentionally preserved
 *      so commits remain reachable via `git log --all`.
 *
 * Usage:
 *   node tools/worktree-cleanup.mjs            # dry-run (default)
 *   node tools/worktree-cleanup.mjs --execute  # actually remove
 */

import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const WORKTREE_PARENT = ".claude/worktrees";
const AGENT_PREFIX = "agent-";

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

async function isClean(worktreePath) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", worktreePath, "status", "--porcelain"]);
    return stdout.trim() === "";
  } catch {
    return false;
  }
}

async function unlockAndRemove(worktreePath) {
  await execFileAsync("git", ["worktree", "unlock", worktreePath]);
  await execFileAsync("git", ["worktree", "remove", "--force", worktreePath]);
}

export async function cleanupWorktrees({ execute = false, parent = WORKTREE_PARENT } = {}) {
  let names;
  try {
    names = await readdir(parent);
  } catch (err) {
    return {
      error: `Cannot read ${parent}: ${err.message}`,
      removed: [],
      skipped: [],
      dryRun: !execute,
    };
  }
  const candidates = names.filter((n) => n.startsWith(AGENT_PREFIX)).map((n) => join(parent, n));

  const removed = [];
  const skipped = [];

  for (const wt of candidates) {
    const size = await dirSize(wt);
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
        skipped.push({ path: wt, size, reason: `remove failed: ${err.message}` });
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
