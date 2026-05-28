import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/shell.mjs", () => ({
  exec: vi.fn(),
}));

const { exec } = await import("../../src/lib/shell.mjs");
const { status, start, stop, restart, logs } = await import("../../src/cliproxy/docker.mjs");

const ok = (stdout) => ({ ok: true, stdout, stderr: "", exitCode: 0, timedOut: false });
const fail = (stderr = "") => ({ ok: false, stdout: "", stderr, exitCode: 1, timedOut: false });

const COMPOSE_FILE = "~/docker/cliproxy/compose.yml";

describe("docker provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("status()", () => {
    it("returns running:true when container state is running", async () => {
      exec.mockResolvedValueOnce(ok(JSON.stringify([{ State: "running", Name: "cliproxy" }])));

      const result = await status();

      expect(result.running).toBe(true);
      expect(result.details).toBe("container running");
    });

    it("returns running:false when container state is exited", async () => {
      exec.mockResolvedValueOnce(ok(JSON.stringify([{ State: "exited", Name: "cliproxy" }])));

      const result = await status();

      expect(result.running).toBe(false);
      expect(result.details).toBe("exited");
    });

    it("returns running:false when docker command fails", async () => {
      exec.mockResolvedValueOnce(fail("docker: command not found"));

      const result = await status();

      expect(result.running).toBe(false);
      expect(result.details).toBe("docker not available or compose file missing");
    });

    it("returns running:false when output is not valid JSON", async () => {
      exec.mockResolvedValueOnce(ok("not json"));

      const result = await status();

      expect(result.running).toBe(false);
      expect(result.details).toMatch(/docker compose returned non-JSON output/);
    });

    it("returns running:false when services array is empty", async () => {
      exec.mockResolvedValueOnce(ok("[]"));

      const result = await status();

      expect(result.running).toBe(false);
      expect(result.details).toBe("no services found");
    });

    it("uses the correct compose file path", async () => {
      exec.mockResolvedValueOnce(ok("[]"));

      await status();

      expect(exec).toHaveBeenCalledWith(`wsl docker compose -f ${COMPOSE_FILE} ps --format json`);
    });
  });

  describe("start()", () => {
    it("calls docker compose up -d with correct compose file", async () => {
      exec.mockResolvedValueOnce(ok("Started"));

      await start();

      expect(exec).toHaveBeenCalledWith(`wsl docker compose -f ${COMPOSE_FILE} up -d`);
    });

    it("returns ok:true on success", async () => {
      exec.mockResolvedValueOnce(ok("Started"));

      const result = await start();

      expect(result.ok).toBe(true);
      expect(result.message).toBeTruthy();
    });

    it("returns ok:false on failure", async () => {
      exec.mockResolvedValueOnce(fail("Error: cannot connect to Docker daemon"));

      const result = await start();

      expect(result.ok).toBe(false);
      expect(result.message).toBeTruthy();
    });
  });

  describe("stop()", () => {
    it("calls docker compose down with correct compose file", async () => {
      exec.mockResolvedValueOnce(ok("Stopped"));

      await stop();

      expect(exec).toHaveBeenCalledWith(`wsl docker compose -f ${COMPOSE_FILE} down`);
    });

    it("returns ok:true on success", async () => {
      exec.mockResolvedValueOnce(ok("Stopped"));

      const result = await stop();

      expect(result.ok).toBe(true);
      expect(result.message).toBeTruthy();
    });

    it("returns ok:false on failure", async () => {
      exec.mockResolvedValueOnce(fail("Error stopping container"));

      const result = await stop();

      expect(result.ok).toBe(false);
      expect(result.message).toBeTruthy();
    });
  });

  describe("restart()", () => {
    it("calls docker compose restart with correct compose file", async () => {
      exec.mockResolvedValueOnce(ok("Restarted"));

      await restart();

      expect(exec).toHaveBeenCalledWith(`wsl docker compose -f ${COMPOSE_FILE} restart`);
    });

    it("returns ok:true on success", async () => {
      exec.mockResolvedValueOnce(ok("Restarted"));

      const result = await restart();

      expect(result.ok).toBe(true);
      expect(result.message).toBeTruthy();
    });

    it("returns ok:false on failure", async () => {
      exec.mockResolvedValueOnce(fail("Error restarting container"));

      const result = await restart();

      expect(result.ok).toBe(false);
      expect(result.message).toBeTruthy();
    });
  });

  describe("logs()", () => {
    it("calls docker compose logs with default tail count of 50", async () => {
      exec.mockResolvedValueOnce(ok("log output"));

      await logs();

      expect(exec).toHaveBeenCalledWith(`wsl docker compose -f ${COMPOSE_FILE} logs --tail 50`);
    });

    it("calls docker compose logs with custom tail count", async () => {
      exec.mockResolvedValueOnce(ok("log output"));

      await logs(100);

      expect(exec).toHaveBeenCalledWith(`wsl docker compose -f ${COMPOSE_FILE} logs --tail 100`);
    });

    it("returns stdout and stderr from exec", async () => {
      exec.mockResolvedValueOnce({
        ok: true,
        stdout: "some log lines",
        stderr: "warning: something",
        exitCode: 0,
        timedOut: false,
      });

      const result = await logs(25);

      expect(result.stdout).toBe("some log lines");
      expect(result.stderr).toBe("warning: something");
    });
  });
});
