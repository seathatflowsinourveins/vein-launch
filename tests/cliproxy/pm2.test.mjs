/**
 * Tests for the PM2 CLIProxy provider.
 * Mocks shell.mjs exec to stay fully unit-isolated.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/shell.mjs", () => ({
  execArgs: vi.fn(),
}));

const { execArgs } = await import("../../src/lib/shell.mjs");
const { logs, restart, start, status, stop } = await import("../../src/cliproxy/pm2.mjs");

/** Build a successful exec result with given stdout. */
const ok = (stdout) => ({ ok: true, stdout, stderr: "", exitCode: 0, timedOut: false });

/** Build a failed exec result with given stderr. */
const fail = (stderr = "") => ({ ok: false, stdout: "", stderr, exitCode: 1, timedOut: false });

/** Minimal PM2 describe JSON for a process with the given status and pid. */
const pm2Json = (pmStatus, pid = 12345) =>
  JSON.stringify([
    {
      pm_id: 0,
      name: "cliproxy",
      pm2_env: { status: pmStatus, pm_pid_path: "/tmp/cliproxy.pid" },
      pid,
    },
  ]);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// status()
// ---------------------------------------------------------------------------

describe("status()", () => {
  it("returns running:true when pm2 shows online", async () => {
    execArgs.mockResolvedValueOnce(ok(pm2Json("online")));

    const result = await status();

    expect(result.running).toBe(true);
    expect(result.details).toBe("online");
  });

  it("returns running:false when pm2 shows stopped", async () => {
    execArgs.mockResolvedValueOnce(ok(pm2Json("stopped")));

    const result = await status();

    expect(result.running).toBe(false);
    expect(result.details).toBe("stopped");
  });

  it("returns running:false when pm2 shows errored", async () => {
    execArgs.mockResolvedValueOnce(ok(pm2Json("errored")));

    const result = await status();

    expect(result.running).toBe(false);
    expect(result.details).toBe("errored");
  });

  it("returns running:false when pm2 describe fails (non-zero exit)", async () => {
    execArgs.mockResolvedValueOnce(fail("process or namespace not found"));

    const result = await status();

    expect(result.running).toBe(false);
    expect(result.pid).toBeNull();
    expect(result.details).toBe("not found");
  });

  it("returns running:false when pm2 returns empty JSON array", async () => {
    execArgs.mockResolvedValueOnce(ok(JSON.stringify([])));

    const result = await status();

    expect(result.running).toBe(false);
    expect(result.pid).toBeNull();
    expect(result.details).toBe("not found");
  });

  it("parses pid from JSON output when process is online", async () => {
    execArgs.mockResolvedValueOnce(ok(pm2Json("online", 99001)));

    const result = await status();

    expect(result.pid).toBe(99001);
  });

  it("returns pid:null when process is stopped", async () => {
    execArgs.mockResolvedValueOnce(ok(pm2Json("stopped", 0)));

    const result = await status();

    expect(result.pid).toBeNull();
  });

  it("calls execArgs with pm2 describe command", async () => {
    execArgs.mockResolvedValueOnce(fail());

    await status();

    expect(execArgs).toHaveBeenCalledWith("pm2", ["describe", "cliproxy", "--json"]);
  });
});

// ---------------------------------------------------------------------------
// start()
// ---------------------------------------------------------------------------

describe("start()", () => {
  it("calls pm2 start with the provided binary path", async () => {
    execArgs.mockResolvedValueOnce(ok(""));

    await start("/usr/bin/claude");

    expect(execArgs).toHaveBeenCalledWith("pm2", [
      "start",
      "/usr/bin/claude",
      "--name",
      "cliproxy",
    ]);
  });

  it("returns ok:true on success", async () => {
    execArgs.mockResolvedValueOnce(ok(""));

    const result = await start("/usr/bin/claude");

    expect(result.ok).toBe(true);
    expect(result.message).toBe("started");
  });

  it("returns ok:false with stderr on failure", async () => {
    execArgs.mockResolvedValueOnce(fail("binary not found"));

    const result = await start("/missing/bin");

    expect(result.ok).toBe(false);
    expect(result.message).toBe("binary not found");
  });
});

// ---------------------------------------------------------------------------
// stop()
// ---------------------------------------------------------------------------

describe("stop()", () => {
  it("calls pm2 stop cliproxy", async () => {
    execArgs.mockResolvedValueOnce(ok(""));

    await stop();

    expect(execArgs).toHaveBeenCalledWith("pm2", ["stop", "cliproxy"]);
  });

  it("returns ok:true when pm2 stop succeeds", async () => {
    execArgs.mockResolvedValueOnce(ok(""));

    const result = await stop();

    expect(result.ok).toBe(true);
    expect(result.message).toBe("stopped");
  });

  it("returns ok:false with stderr when pm2 stop fails", async () => {
    execArgs.mockResolvedValueOnce(fail("process cliproxy not found"));

    const result = await stop();

    expect(result.ok).toBe(false);
    expect(result.message).toBe("process cliproxy not found");
  });
});

// ---------------------------------------------------------------------------
// restart()
// ---------------------------------------------------------------------------

describe("restart()", () => {
  it("calls pm2 restart cliproxy", async () => {
    execArgs.mockResolvedValueOnce(ok(""));

    await restart();

    expect(execArgs).toHaveBeenCalledWith("pm2", ["restart", "cliproxy"]);
  });

  it("returns ok:true when pm2 restart succeeds", async () => {
    execArgs.mockResolvedValueOnce(ok(""));

    const result = await restart();

    expect(result.ok).toBe(true);
    expect(result.message).toBe("restarted");
  });

  it("returns ok:false with stderr when pm2 restart fails", async () => {
    execArgs.mockResolvedValueOnce(fail("process cliproxy not found"));

    const result = await restart();

    expect(result.ok).toBe(false);
    expect(result.message).toBe("process cliproxy not found");
  });
});

// ---------------------------------------------------------------------------
// logs()
// ---------------------------------------------------------------------------

describe("logs()", () => {
  it("calls pm2 logs with correct default line count (50)", async () => {
    execArgs.mockResolvedValueOnce(ok(""));

    await logs();

    expect(execArgs).toHaveBeenCalledWith("pm2", [
      "logs",
      "cliproxy",
      "--nostream",
      "--lines",
      "50",
    ]);
  });

  it("calls pm2 logs with a custom line count", async () => {
    execArgs.mockResolvedValueOnce(ok(""));

    await logs(200);

    expect(execArgs).toHaveBeenCalledWith("pm2", [
      "logs",
      "cliproxy",
      "--nostream",
      "--lines",
      "200",
    ]);
  });

  it("returns stdout and stderr from the exec result", async () => {
    execArgs.mockResolvedValueOnce({
      ok: true,
      stdout: "log line 1\nlog line 2",
      stderr: "some warning",
      exitCode: 0,
      timedOut: false,
    });

    const result = await logs(10);

    expect(result.stdout).toBe("log line 1\nlog line 2");
    expect(result.stderr).toBe("some warning");
  });
});
