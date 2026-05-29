import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/cliproxy/pm2.mjs", () => ({
  status: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  restart: vi.fn(),
  logs: vi.fn(),
}));

vi.mock("../../src/cliproxy/docker.mjs", () => ({
  status: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  restart: vi.fn(),
  logs: vi.fn(),
}));

const pm2 = await import("../../src/cliproxy/pm2.mjs");
const docker = await import("../../src/cliproxy/docker.mjs");
const { getStatus, startProxy, stopProxy, restartProxy, getProxyLogs, ensureRunning } =
  await import("../../src/cliproxy/manager.mjs");

const pm2Config = {
  cliproxy: {
    hosting: "pm2",
    port: 8317,
    binaryPath: "/path/to/cli-proxy-api",
    cwd: "/path/to",
  },
};
const dockerConfig = { cliproxy: { hosting: "docker", port: 8317 } };
const noConfig = {};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getStatus", () => {
  it("delegates to pm2 when hosting=pm2", async () => {
    pm2.status.mockResolvedValue({ running: true, pid: 1234, details: "online" });
    const result = await getStatus(pm2Config);
    expect(pm2.status).toHaveBeenCalledOnce();
    expect(docker.status).not.toHaveBeenCalled();
    expect(result.running).toBe(true);
  });

  it("delegates to docker when hosting=docker", async () => {
    docker.status.mockResolvedValue({ running: true, details: "running" });
    const result = await getStatus(dockerConfig);
    expect(docker.status).toHaveBeenCalledOnce();
    expect(pm2.status).not.toHaveBeenCalled();
    expect(result.running).toBe(true);
  });

  it("returns not configured when no cliproxy config", async () => {
    const result = await getStatus(noConfig);
    expect(result.running).toBe(false);
    expect(result.hosting).toBe("none");
    expect(result.details).toMatch(/not configured/i);
  });

  it("includes hosting field in result", async () => {
    pm2.status.mockResolvedValue({ running: false, pid: null, details: "stopped" });
    const result = await getStatus(pm2Config);
    expect(result.hosting).toBe("pm2");
  });
});

describe("startProxy", () => {
  it("delegates to pm2.start with binaryPath from config", async () => {
    pm2.start.mockResolvedValue({ ok: true, message: "started" });
    const result = await startProxy(pm2Config);
    expect(pm2.start).toHaveBeenCalledWith("/path/to/cli-proxy-api", {
      cwd: "/path/to",
    });
    expect(result.ok).toBe(true);
  });

  it("uses default binaryPath when not in config", async () => {
    pm2.start.mockResolvedValue({ ok: true, message: "started" });
    const configNoBinary = { cliproxy: { hosting: "pm2", port: 8317 } };
    await startProxy(configNoBinary);
    expect(pm2.start).toHaveBeenCalledWith("cli-proxy-api", {
      cwd: undefined,
    });
  });

  it("delegates to docker.start with no binaryPath argument", async () => {
    docker.start.mockResolvedValue({ ok: true, message: "started" });
    const result = await startProxy(dockerConfig);
    expect(docker.start).toHaveBeenCalledWith();
    expect(result.ok).toBe(true);
  });

  it("returns error when not configured", async () => {
    const result = await startProxy(noConfig);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not configured/i);
  });
});

describe("stopProxy", () => {
  it("delegates to the correct provider (pm2)", async () => {
    pm2.stop.mockResolvedValue({ ok: true, message: "stopped" });
    const result = await stopProxy(pm2Config);
    expect(pm2.stop).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
  });

  it("delegates to the correct provider (docker)", async () => {
    docker.stop.mockResolvedValue({ ok: true, message: "stopped" });
    const result = await stopProxy(dockerConfig);
    expect(docker.stop).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
  });

  it("returns error when not configured", async () => {
    const result = await stopProxy(noConfig);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not configured/i);
  });
});

describe("restartProxy", () => {
  it("delegates to the correct provider (pm2)", async () => {
    pm2.restart.mockResolvedValue({ ok: true, message: "restarted" });
    const result = await restartProxy(pm2Config);
    expect(pm2.restart).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
  });

  it("delegates to the correct provider (docker)", async () => {
    docker.restart.mockResolvedValue({ ok: true, message: "restarted" });
    const result = await restartProxy(dockerConfig);
    expect(docker.restart).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
  });
});

describe("getProxyLogs", () => {
  it("delegates to provider with specified line count", async () => {
    pm2.logs.mockResolvedValue({ stdout: "log line", stderr: "" });
    const result = await getProxyLogs(pm2Config, 100);
    expect(pm2.logs).toHaveBeenCalledWith(100);
    expect(result.stdout).toBe("log line");
  });

  it("uses default line count of 50 when not specified", async () => {
    docker.logs.mockResolvedValue({ stdout: "docker log", stderr: "" });
    await getProxyLogs(dockerConfig);
    expect(docker.logs).toHaveBeenCalledWith(50);
  });

  it("returns error in stderr when not configured", async () => {
    const result = await getProxyLogs(noConfig);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/not configured/i);
  });
});

describe("ensureRunning", () => {
  it("returns wasStarted:false when already running", async () => {
    pm2.status.mockResolvedValue({ running: true, pid: 1234, details: "online" });
    const result = await ensureRunning(pm2Config);
    expect(result.ok).toBe(true);
    expect(result.wasStarted).toBe(false);
    expect(result.message).toBe("already running");
    expect(pm2.start).not.toHaveBeenCalled();
  });

  it("starts and returns wasStarted:true when not running", async () => {
    pm2.status.mockResolvedValue({ running: false, pid: null, details: "stopped" });
    pm2.start.mockResolvedValue({ ok: true, message: "started" });
    const result = await ensureRunning(pm2Config);
    expect(result.ok).toBe(true);
    expect(result.wasStarted).toBe(true);
    expect(pm2.start).toHaveBeenCalledOnce();
  });

  it("returns ok:false when start fails", async () => {
    pm2.status.mockResolvedValue({ running: false, pid: null, details: "stopped" });
    pm2.start.mockResolvedValue({ ok: false, message: "binary not found" });
    const result = await ensureRunning(pm2Config);
    expect(result.ok).toBe(false);
    expect(result.wasStarted).toBe(true);
    expect(result.message).toBe("binary not found");
  });

  it("returns ok:false when not configured", async () => {
    const result = await ensureRunning(noConfig);
    expect(result.ok).toBe(false);
    expect(result.wasStarted).toBe(false);
    expect(result.message).toMatch(/not configured/i);
  });
});
