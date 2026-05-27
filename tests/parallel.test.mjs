import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/shell.mjs", () => ({
  exec: vi.fn(),
}));

const { exec } = await import("../src/lib/shell.mjs");
const { spawnSessions, buildWtCommand, spawnFromConfig } = await import("../src/parallel.mjs");

const ok = (stdout = "") => ({ ok: true, stdout, stderr: "", exitCode: 0, timedOut: false });
const fail = (stderr = "error") => ({
  ok: false,
  stdout: "",
  stderr,
  exitCode: 1,
  timedOut: false,
});

describe("buildWtCommand", () => {
  it("generates correct wt command with session name and cwd", () => {
    const cmd = buildWtCommand({ name: "worker-1", cwd: "C:/work/project" });
    expect(cmd).toContain("wt -w 0 new-tab");
    expect(cmd).toContain('--title "worker-1"');
    expect(cmd).toContain('-d "C:/work/project"');
    expect(cmd).toContain("claude");
  });

  it("includes --dangerously-skip-permissions by default", () => {
    const cmd = buildWtCommand({ name: "test", cwd: "C:/tmp" });
    expect(cmd).toContain("--dangerously-skip-permissions");
  });

  it("uses custom args when provided", () => {
    const cmd = buildWtCommand({ name: "test", cwd: "C:/tmp", args: ["--model", "opus"] });
    expect(cmd).toContain("--model");
    expect(cmd).toContain("opus");
    expect(cmd).not.toContain("--dangerously-skip-permissions");
  });
});

describe("spawnSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("spawns all sessions and returns correct spawned count", async () => {
    exec.mockResolvedValue(ok());
    const sessions = [
      { name: "a", cwd: "C:/a" },
      { name: "b", cwd: "C:/b" },
    ];
    const result = await spawnSessions(sessions);
    expect(result.spawned).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("counts spawned and failed correctly when some fail", async () => {
    exec.mockResolvedValueOnce(ok()).mockResolvedValueOnce(fail("timeout"));
    const sessions = [
      { name: "a", cwd: "C:/a" },
      { name: "b", cwd: "C:/b" },
    ];
    const result = await spawnSessions(sessions);
    expect(result.spawned).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("returns session-level results with name, ok, message", async () => {
    exec.mockResolvedValue(ok());
    const sessions = [{ name: "mySession", cwd: "C:/mydir" }];
    const result = await spawnSessions(sessions);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      name: "mySession",
      ok: true,
      message: expect.any(String),
    });
  });

  it("in dry-run mode does NOT call exec", async () => {
    const sessions = [
      { name: "a", cwd: "C:/a" },
      { name: "b", cwd: "C:/b" },
    ];
    await spawnSessions(sessions, { dryRun: true });
    expect(exec).not.toHaveBeenCalled();
  });

  it("in dry-run mode returns the command in message", async () => {
    const sessions = [{ name: "dry-test", cwd: "C:/dry" }];
    const result = await spawnSessions(sessions, { dryRun: true });
    expect(result.sessions[0].ok).toBe(true);
    expect(result.sessions[0].message).toContain("[dry-run]");
    expect(result.sessions[0].message).toContain("wt");
  });

  it("handles exec failure gracefully", async () => {
    exec.mockResolvedValue(fail("wt not found"));
    const sessions = [{ name: "fail-session", cwd: "C:/nope" }];
    const result = await spawnSessions(sessions);
    expect(result.failed).toBe(1);
    expect(result.sessions[0].ok).toBe(false);
    expect(result.sessions[0].message).toBe("wt not found");
  });

  it("returns correct shape (spawned, failed, sessions array)", async () => {
    exec.mockResolvedValue(ok());
    const result = await spawnSessions([{ name: "s", cwd: "C:/s" }]);
    expect(result).toHaveProperty("spawned");
    expect(result).toHaveProperty("failed");
    expect(result).toHaveProperty("sessions");
    expect(Array.isArray(result.sessions)).toBe(true);
  });

  it("returns empty result for empty sessions array", async () => {
    const result = await spawnSessions([]);
    expect(result.spawned).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.sessions).toHaveLength(0);
  });
});

describe("spawnFromConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty result when no parallel sessions configured", async () => {
    const result = await spawnFromConfig({});
    expect(result).toEqual({ spawned: 0, failed: 0, sessions: [] });
  });

  it("returns empty result when parallel.sessions is empty array", async () => {
    const result = await spawnFromConfig({ parallel: { sessions: [] } });
    expect(result).toEqual({ spawned: 0, failed: 0, sessions: [] });
  });

  it("spawns sessions from config.parallel.sessions", async () => {
    exec.mockResolvedValue(ok());
    const config = {
      parallel: {
        sessions: [
          { name: "cfg-a", cwd: "C:/cfg/a" },
          { name: "cfg-b", cwd: "C:/cfg/b" },
        ],
      },
    };
    const result = await spawnFromConfig(config);
    expect(result.spawned).toBe(2);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("all session results have correct shape", async () => {
    exec.mockResolvedValue(ok());
    const config = {
      parallel: {
        sessions: [{ name: "shape-check", cwd: "C:/shape" }],
      },
    };
    const result = await spawnFromConfig(config);
    expect(result.sessions[0]).toMatchObject({
      name: "shape-check",
      ok: true,
      message: expect.any(String),
    });
  });
});
