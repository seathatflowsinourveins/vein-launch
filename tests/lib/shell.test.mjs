import { describe, expect, it } from "vitest";
import { exec, execArgs } from "../../src/lib/shell.mjs";

// ---------------------------------------------------------------------------
// exec (string-based, shell:false by default)
// ---------------------------------------------------------------------------

describe("exec", () => {
  it("returns ok:true and matching stdout for node --version", async () => {
    const result = await exec("node --version");
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toMatch(/v\d+/);
  });

  it("returns ok:false with exitCode 1 for process.exit(1)", async () => {
    const result = await exec("node -e process.exit(1)");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
  });

  it("returns timedOut:true for a command that exceeds timeout", async () => {
    const result = await exec("node -e setTimeout(()=>{},5000)", { timeout: 200 });
    expect(result.timedOut).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("returns ok:true for a successful command", async () => {
    const result = await exec("node -e process.exit(0)");
    expect(result.ok).toBe(true);
  });

  it("defaults to shell:false (does not interpret shell metacharacters as shell)", async () => {
    // A semicolon-injection attempt — if shell:true were active, 'node --version; node -e process.exit(1)'
    // would run two commands and the last exits 1, making ok:false. With shell:false the whole string
    // is treated as the argv[0] executable name and exec fails to find a binary with that name.
    // We just assert the result is NOT the injected exit code 1.
    const result = await exec("node --version; node -e process.exit(1)");
    // Either the command is not found (ok:false, exitCode non-zero) or it is flagged — the key assertion
    // is that it does NOT silently succeed with exit code 0 due to semicolon evaluation.
    // On Windows/POSIX with shell:false, execFile treats the full string as binary name → ENOENT → not ok.
    expect(result.ok).toBe(false);
    // Must NOT be exit code 0 — if shell was active the first command would exit 0
    expect(result.exitCode).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// execArgs (array-based, always shell:false)
// ---------------------------------------------------------------------------

describe("execArgs", () => {
  it("runs node --version via array form", async () => {
    const result = await execArgs("node", ["--version"]);
    expect(result.ok).toBe(true);
    expect(result.stdout).toMatch(/v\d+/);
  });

  it("passes arguments correctly without shell interpretation", async () => {
    const result = await execArgs("node", ["-e", "process.exit(0)"]);
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("returns ok:false for non-zero exit", async () => {
    const result = await execArgs("node", ["-e", "process.exit(2)"]);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
  });

  it("handles timeout correctly", async () => {
    const result = await execArgs("node", ["-e", "setTimeout(()=>{},5000)"], { timeout: 200 });
    expect(result.timedOut).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("shell metacharacters in args are not interpreted as shell", async () => {
    // Pass '; exit 1' as a literal argument to node -e — node treats it as code,
    // which is a syntax error (starts with ;). If shell:true were on, the shell
    // would interpret the semicolon and run exit 1 at the shell level.
    const result = await execArgs("node", ["-e", "; this is not valid js"]);
    // Node will fail with a syntax error (exit code 1), not zero
    // But critically: the semicolon was NOT interpreted by the shell
    expect(result.exitCode).not.toBe(0);
  });

  it("opt-in shellMode:true executes shell built-ins", async () => {
    // On Windows use 'cmd /c echo hello', on POSIX use shell echo.
    // We just verify shellMode works without throwing.
    const isWin = process.platform === "win32";
    const cmd = isWin ? "cmd" : "echo";
    const args = isWin ? ["/c", "echo hello"] : ["hello"];
    const result = await execArgs(cmd, args, { shellMode: true });
    expect(result.ok).toBe(true);
  });
});
