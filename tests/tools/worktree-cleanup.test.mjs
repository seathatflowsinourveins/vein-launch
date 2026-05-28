import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  realpath: vi.fn(),
  stat: vi.fn(),
}));

const { execFile } = await import("node:child_process");
const { readdir, realpath, stat } = await import("node:fs/promises");
const { cleanupWorktrees } = await import("../../tools/worktree-cleanup.mjs");

/**
 * Bridge a callback-style execFile mock impl to a per-call result.
 * impl(file, args, opts) may return { stdout, stderr } or throw to simulate failure.
 */
function setExecFile(impl) {
  execFile.mockImplementation((file, args, optsOrCb, maybeCb) => {
    const cb = typeof optsOrCb === "function" ? optsOrCb : maybeCb;
    const opts = typeof optsOrCb === "function" ? {} : optsOrCb;
    try {
      const out = impl(file, args, opts);
      if (out && typeof out.then === "function") {
        out.then(
          (r) => cb(null, r),
          (e) => cb(e),
        );
      } else {
        cb(null, out);
      }
    } catch (e) {
      cb(e);
    }
  });
}

const REPO_ROOT = "/repo";
const WT_PARENT_REL = ".claude/worktrees";

function makeDir(name) {
  return { name, isDirectory: () => true, isFile: () => false };
}

/** Match any path that ends in the worktrees parent — separator-agnostic. */
function isWorktreeParentPath(p) {
  const norm = String(p).replace(/\\/g, "/");
  return /\.claude\/worktrees$/.test(norm);
}

beforeEach(() => {
  vi.clearAllMocks();
  realpath.mockImplementation(async (p) => p);
  stat.mockResolvedValue({ mtimeMs: Date.now() - 24 * 60 * 60 * 1000, size: 0 });
});

describe("worktree-cleanup — path safety", () => {
  it("rejects parent that escapes repo root", async () => {
    realpath.mockImplementation(async (p) => {
      if (p.includes("escape")) return "/elsewhere/escape";
      return p;
    });

    const result = await cleanupWorktrees({
      execute: true,
      parent: "../escape",
      repoRoot: REPO_ROOT,
    });

    expect(result.error).toMatch(/escapes repo root|cannot be resolved/i);
    expect(result.removed).toHaveLength(0);
  });

  it("errors when not inside a git repo (no repoRoot resolvable)", async () => {
    setExecFile(() => {
      throw new Error("not a git repository");
    });

    const result = await cleanupWorktrees({ execute: false });
    expect(result.error).toMatch(/not inside a git repository/i);
  });

  it("returns error when parent cannot be read", async () => {
    readdir.mockRejectedValueOnce(new Error("ENOENT: no such dir"));
    const result = await cleanupWorktrees({
      execute: true,
      parent: WT_PARENT_REL,
      repoRoot: REPO_ROOT,
    });
    expect(result.error).toMatch(/Cannot read/i);
  });
});

describe("worktree-cleanup — dry-run default", () => {
  it("reports would-remove without invoking git worktree remove", async () => {
    readdir.mockImplementation(async (p) => {
      if (isWorktreeParentPath(p)) return [makeDir("agent-abc"), makeDir("non-agent")];
      return [];
    });
    setExecFile((file, args) => {
      if (file === "git" && args.includes("status")) return { stdout: "", stderr: "" };
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    });

    const result = await cleanupWorktrees({
      parent: WT_PARENT_REL,
      repoRoot: REPO_ROOT,
    });

    expect(result.dryRun).toBe(true);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].action).toBe("would-remove");
    expect(result.removed[0].path).toContain("agent-abc");

    const removeCalls = execFile.mock.calls.filter(
      (c) => c[1]?.[0] === "worktree" && c[1]?.[1] === "remove",
    );
    expect(removeCalls).toHaveLength(0);
  });
});

describe("worktree-cleanup — skip rules", () => {
  it("skips dirty worktrees (non-empty git status)", async () => {
    readdir.mockImplementation(async (p) => {
      if (isWorktreeParentPath(p)) return [makeDir("agent-dirty")];
      return [];
    });
    setExecFile((file, args) => {
      if (args.includes("status")) return { stdout: " M file.txt\n", stderr: "" };
      throw new Error("unexpected");
    });

    const result = await cleanupWorktrees({
      execute: true,
      parent: WT_PARENT_REL,
      repoRoot: REPO_ROOT,
    });

    expect(result.removed).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/dirty/i);
  });

  it("skips worktrees younger than minAgeMs (active-agent guard)", async () => {
    readdir.mockImplementation(async (p) => {
      if (isWorktreeParentPath(p)) return [makeDir("agent-fresh")];
      return [];
    });
    stat.mockResolvedValueOnce({ mtimeMs: Date.now() - 30_000, size: 0 });

    const result = await cleanupWorktrees({
      execute: true,
      parent: WT_PARENT_REL,
      repoRoot: REPO_ROOT,
      minAgeMs: 60 * 60 * 1000,
    });

    expect(result.removed).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/too recent/i);
  });
});

describe("worktree-cleanup — execute mode", () => {
  it("calls git worktree remove WITHOUT --force on clean+old worktrees", async () => {
    readdir.mockImplementation(async (p) => {
      if (isWorktreeParentPath(p)) return [makeDir("agent-ready")];
      return [];
    });
    setExecFile((file, args) => {
      if (args.includes("status")) return { stdout: "", stderr: "" };
      if (args.includes("unlock")) return { stdout: "", stderr: "" };
      if (args[0] === "worktree" && args[1] === "remove") {
        // Codex BLOCKER fix: --force must NOT be passed
        expect(args).not.toContain("--force");
        return { stdout: "", stderr: "" };
      }
      throw new Error(`unexpected: ${args.join(" ")}`);
    });

    const result = await cleanupWorktrees({
      execute: true,
      parent: WT_PARENT_REL,
      repoRoot: REPO_ROOT,
    });

    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].action).toBe("removed");
  });

  it("treats remove-refusal (race-dirty) as skipped, not data loss", async () => {
    readdir.mockImplementation(async (p) => {
      if (isWorktreeParentPath(p)) return [makeDir("agent-race")];
      return [];
    });
    setExecFile((file, args) => {
      if (args.includes("status")) return { stdout: "", stderr: "" };
      if (args.includes("unlock")) return { stdout: "", stderr: "" };
      if (args[0] === "worktree" && args[1] === "remove") {
        const err = new Error("fatal: 'agent-race' contains modified or untracked files");
        err.stderr = "fatal: contains modified or untracked files\n";
        throw err;
      }
      throw new Error(`unexpected: ${args.join(" ")}`);
    });

    const result = await cleanupWorktrees({
      execute: true,
      parent: WT_PARENT_REL,
      repoRoot: REPO_ROOT,
    });

    expect(result.removed).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/race-dirty|refused/i);
  });

  it("tolerates 'not locked' from git worktree unlock", async () => {
    readdir.mockImplementation(async (p) => {
      if (isWorktreeParentPath(p)) return [makeDir("agent-unlocked")];
      return [];
    });
    let removeCalled = false;
    setExecFile((file, args) => {
      if (args.includes("status")) return { stdout: "", stderr: "" };
      if (args.includes("unlock")) {
        const err = new Error("fatal: 'path' is not locked");
        err.stderr = "fatal: 'path' is not locked\n";
        throw err;
      }
      if (args[0] === "worktree" && args[1] === "remove") {
        removeCalled = true;
        return { stdout: "", stderr: "" };
      }
      throw new Error("unexpected");
    });

    const result = await cleanupWorktrees({
      execute: true,
      parent: WT_PARENT_REL,
      repoRoot: REPO_ROOT,
    });

    expect(removeCalled).toBe(true);
    expect(result.removed).toHaveLength(1);
  });
});
