/**
 * Tests for src/lib/sessions.mjs
 * Covers: createSession, listSessions, cleanSessions, getSessionCount
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mutable state so it's available inside vi.mock() factory closures.
// vi.mock() calls are hoisted above all imports, so any state they reference
// must itself be hoisted via vi.hoisted().
// ---------------------------------------------------------------------------

const { mockState } = vi.hoisted(() => {
  return {
    mockState: {
      files: /** @type {Record<string, string>} */ ({}),
      dirExists: false,
    },
  };
});

const FAKE_SESSIONS_DIR_POSIX = "/fake-home/.vein/sessions";

vi.mock("node:os", () => ({
  homedir: () => "/fake-home",
}));

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    existsSync: (p) => {
      const normalized = String(p).replace(/\\/g, "/");
      // Match sessions dir by suffix (handles Windows backslash paths)
      if (normalized.endsWith("/.vein/sessions")) {
        return mockState.dirExists;
      }
      return mockState.files[normalized] !== undefined;
    },
  };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockImplementation(async (p, content) => {
      const normalized = String(p).replace(/\\/g, "/");
      mockState.files[normalized] = content;
    }),
    readdir: vi.fn().mockImplementation(async (p) => {
      const normalized = String(p).replace(/\\/g, "/");
      // Only handle our sessions directory
      if (!normalized.endsWith("/.vein/sessions")) return [];
      return Object.keys(mockState.files)
        .filter((k) => k.includes("/.vein/sessions/"))
        .map((k) => k.replace(/^.*\/.vein\/sessions\//, ""));
    }),
    readFile: vi.fn().mockImplementation(async (p) => {
      const normalized = String(p).replace(/\\/g, "/");
      // Direct lookup
      let content = mockState.files[normalized];
      // Fall back to suffix match for cross-platform (backslash vs forward-slash)
      if (content === undefined) {
        const suffix = normalized.replace(/^.*\/.vein\/sessions\//, "");
        const key = Object.keys(mockState.files).find((k) => k.endsWith(`/${suffix}`));
        content = key ? mockState.files[key] : undefined;
      }
      if (content === undefined) throw Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
      return content;
    }),
    unlink: vi.fn().mockImplementation(async (p) => {
      const normalized = String(p).replace(/\\/g, "/");
      if (mockState.files[normalized] !== undefined) {
        delete mockState.files[normalized];
        return;
      }
      // Suffix match for cross-platform
      const suffix = normalized.replace(/^.*\/.vein\/sessions\//, "");
      const key = Object.keys(mockState.files).find((k) => k.endsWith(`/${suffix}`));
      if (key) delete mockState.files[key];
    }),
  };
});

import { mkdir, unlink, writeFile } from "node:fs/promises";
import {
  cleanSessions,
  createSession,
  getSessionCount,
  listSessions,
} from "../../src/lib/sessions.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Seed a session JSON file into the mock FS.
 * Also marks the sessions dir as existing.
 */
function seedSession(id, data) {
  const path = `${FAKE_SESSIONS_DIR_POSIX}/${id}.json`;
  mockState.files[path] = JSON.stringify(data);
  mockState.dirExists = true;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockState.files = {};
  mockState.dirExists = false;
  // clearAllMocks resets call counts/instances without touching implementations.
  // Do NOT use restoreAllMocks — that would undo the module-level vi.mock() factories.
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------

describe("createSession", () => {
  it("writes a valid JSON session file with all required fields", async () => {
    mockState.dirExists = true;
    const session = await createSession({ project: "vein-launch", mode: "fast" });

    expect(session).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
      project: "vein-launch",
      mode: "fast",
      status: "active",
    });
    expect(typeof session.pid).toBe("number");
    expect(session.pid).toBe(process.pid);
    expect(typeof session.startedAt).toBe("string");
    // Should be a valid ISO date
    expect(new Date(session.startedAt).toISOString()).toBe(session.startedAt);

    // Verify file was written
    expect(writeFile).toHaveBeenCalledOnce();
    const [, writtenContent] = writeFile.mock.calls[0];
    const parsed = JSON.parse(writtenContent);
    expect(parsed.id).toBe(session.id);
  });

  it("generates unique UUIDs across multiple calls", async () => {
    mockState.dirExists = true;
    const s1 = await createSession({ project: "p1", mode: "fast" });
    const s2 = await createSession({ project: "p2", mode: "deep" });
    const s3 = await createSession({ project: "p3", mode: "repair" });

    const ids = new Set([s1.id, s2.id, s3.id]);
    expect(ids.size).toBe(3);
  });

  it("creates the sessions directory if it does not exist", async () => {
    mockState.dirExists = false;
    await createSession({ project: "new-project", mode: "fast" });

    expect(mkdir).toHaveBeenCalledOnce();
    const [calledPath, calledOpts] = mkdir.mock.calls[0];
    // Normalize path separators for cross-platform comparison
    expect(String(calledPath).replace(/\\/g, "/")).toContain("/.vein/sessions");
    expect(calledOpts).toEqual({ recursive: true });
  });

  it("stores project and mode accurately in the written file", async () => {
    mockState.dirExists = true;
    await createSession({ project: "trading-system", mode: "deep" });

    const [, writtenContent] = writeFile.mock.calls[0];
    const parsed = JSON.parse(writtenContent);
    expect(parsed.project).toBe("trading-system");
    expect(parsed.mode).toBe("deep");
  });
});

// ---------------------------------------------------------------------------
// listSessions
// ---------------------------------------------------------------------------

describe("listSessions", () => {
  it("returns an empty array when the sessions directory does not exist", async () => {
    mockState.dirExists = false;
    const sessions = await listSessions();
    expect(sessions).toEqual([]);
  });

  it("returns an empty array when the directory exists but has no files", async () => {
    mockState.dirExists = true;
    const sessions = await listSessions();
    expect(sessions).toEqual([]);
  });

  it("filters out sessions whose pid is not alive", async () => {
    seedSession("dead-session", {
      id: "dead-session",
      project: "dead-proj",
      pid: 99999999,
      startedAt: new Date().toISOString(),
      mode: "fast",
      status: "active",
    });

    const sessions = await listSessions();
    // PID 99999999 is dead — session should be filtered out
    expect(sessions.every((s) => s.pid !== 99999999)).toBe(true);
    expect(sessions).toHaveLength(0);
  });

  it("returns active sessions whose pid is alive (current process)", async () => {
    seedSession("alive-session", {
      id: "alive-session",
      project: "live-proj",
      pid: process.pid,
      startedAt: new Date().toISOString(),
      mode: "deep",
      status: "active",
    });

    const sessions = await listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("alive-session");
    expect(sessions[0].project).toBe("live-proj");
  });

  it("skips non-json files gracefully", async () => {
    // Seed a valid alive session
    seedSession("real-session", {
      id: "real-session",
      project: "proj",
      pid: process.pid,
      startedAt: new Date().toISOString(),
      mode: "fast",
      status: "active",
    });
    // Add a non-json file directly (readFile will throw on it, but listSessions
    // should catch that and skip it)
    mockState.files[`${FAKE_SESSIONS_DIR_POSIX}/README.txt`] = "not json";

    const sessions = await listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("real-session");
  });
});

// ---------------------------------------------------------------------------
// cleanSessions
// ---------------------------------------------------------------------------

describe("cleanSessions", () => {
  it("removes files for dead-pid sessions", async () => {
    seedSession("dead-1", {
      id: "dead-1",
      project: "proj",
      pid: 99999999,
      startedAt: new Date().toISOString(),
      mode: "fast",
      status: "active",
    });

    await cleanSessions();

    expect(unlink).toHaveBeenCalledOnce();
    const [removedPath] = unlink.mock.calls[0];
    expect(String(removedPath).replace(/\\/g, "/")).toContain("dead-1");
  });

  it("does not remove files for alive-pid sessions", async () => {
    seedSession("alive-1", {
      id: "alive-1",
      project: "proj",
      pid: process.pid,
      startedAt: new Date().toISOString(),
      mode: "fast",
      status: "active",
    });

    await cleanSessions();

    expect(unlink).not.toHaveBeenCalled();
  });

  it("does nothing when the sessions directory does not exist", async () => {
    mockState.dirExists = false;
    await cleanSessions();
    expect(unlink).not.toHaveBeenCalled();
  });

  it("removes only dead sessions when mixed with alive ones", async () => {
    seedSession("alive-mix", {
      id: "alive-mix",
      project: "alive-proj",
      pid: process.pid,
      startedAt: new Date().toISOString(),
      mode: "fast",
      status: "active",
    });
    seedSession("dead-mix", {
      id: "dead-mix",
      project: "dead-proj",
      pid: 99999999,
      startedAt: new Date().toISOString(),
      mode: "fast",
      status: "active",
    });

    await cleanSessions();

    expect(unlink).toHaveBeenCalledOnce();
    const [removedPath] = unlink.mock.calls[0];
    expect(String(removedPath).replace(/\\/g, "/")).toContain("dead-mix");
  });
});

// ---------------------------------------------------------------------------
// getSessionCount
// ---------------------------------------------------------------------------

describe("getSessionCount", () => {
  it("returns 0 when no sessions directory exists", async () => {
    mockState.dirExists = false;
    const count = await getSessionCount();
    expect(count).toBe(0);
  });

  it("returns 0 when all sessions have dead pids", async () => {
    seedSession("d1", {
      id: "d1",
      project: "p",
      pid: 99999999,
      startedAt: new Date().toISOString(),
      mode: "fast",
      status: "active",
    });
    seedSession("d2", {
      id: "d2",
      project: "p",
      pid: 99999998,
      startedAt: new Date().toISOString(),
      mode: "deep",
      status: "active",
    });

    const count = await getSessionCount();
    expect(count).toBe(0);
  });

  it("returns the correct count of alive sessions", async () => {
    seedSession("a1", {
      id: "a1",
      project: "proj-a",
      pid: process.pid,
      startedAt: new Date().toISOString(),
      mode: "fast",
      status: "active",
    });
    seedSession("d1", {
      id: "d1",
      project: "proj-d",
      pid: 99999999,
      startedAt: new Date().toISOString(),
      mode: "fast",
      status: "active",
    });

    const count = await getSessionCount();
    expect(count).toBe(1);
  });
});
