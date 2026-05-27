/**
 * Safe child_process wrapper with timeout support.
 *
 * Security model:
 * - `execArgs` is the primary API. It calls execFile with shell:false and an explicit args array.
 *   Caller-controlled values are passed as discrete arguments — never concatenated into a shell
 *   string — so shell metacharacters in those values cannot be interpreted by a shell.
 * - `exec` accepts a command string for backward-compatibility. It parses the string by whitespace
 *   and calls execFile with shell:false. This means shell built-ins and pipelines do NOT work, but
 *   callers gain injection safety. Use shellMode:true only when shell features are genuinely needed
 *   AND all arguments have been validated beforehand.
 *
 * NOTE: The old shell:true default has been removed. If you need piping/globbing, use
 * Node's child_process.spawn with shell:true explicitly, document why, and validate inputs.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, isAbsolute, sep } from "node:path";

/**
 * @typedef {{ ok: boolean, stdout: string, stderr: string, exitCode: number, timedOut: boolean }} ExecResult
 */

/**
 * Resolve a bare command name to an extension-suffixed path on Windows.
 *
 * Background: with shell:false (our security-hardened default), Node's
 * execFile does NOT consult PATHEXT — `pm2`, `codex`, `gh`, etc. are
 * .cmd shims installed by npm and won't be found by their bare name.
 * shell:true would resolve them but reintroduces injection risk.
 *
 * This function walks PATH looking for `<cmd>.cmd`, `<cmd>.exe`, `<cmd>.bat`,
 * `<cmd>.com` in order. On non-Windows or when cmd already has an extension
 * or is absolute, returns it unchanged.
 *
 * @param {string} cmd
 * @returns {string}
 */
function resolveCommand(cmd) {
  if (process.platform !== "win32") return cmd;
  if (isAbsolute(cmd) || /\.(exe|cmd|bat|com)$/i.test(cmd) || cmd.includes(sep)) {
    return cmd;
  }
  const exts = [".cmd", ".exe", ".bat", ".com"];
  const dirs = (process.env.PATH || "").split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = `${dir}${sep}${cmd}${ext}`;
      if (existsSync(candidate)) return `${cmd}${ext}`;
    }
  }
  return cmd; // give up; execFile will surface the ENOENT
}

/**
 * Shared callback factory for execFile — keeps error-handling logic in one place.
 * @param {Function} resolve
 * @returns {Function}
 */
function makeCallback(resolve) {
  return (err, stdout, stderr) => {
    if (err?.killed) {
      resolve({ ok: false, stdout: "", stderr: "", exitCode: -1, timedOut: true });
      return;
    }
    const exitCode = err?.code ?? 0;
    resolve({
      ok: exitCode === 0,
      stdout: (stdout ?? "").trim(),
      stderr: (stderr ?? "").trim(),
      exitCode,
      timedOut: false,
    });
  };
}

/**
 * Run a command given as a whitespace-split string.
 * Uses shell:false by default — shell metacharacters are NOT interpreted.
 * For the rare cases that need shell features, pass shellMode:true (validate inputs first).
 *
 * @param {string} command - Command string; split on whitespace to extract cmd + args.
 * @param {{ timeout?: number, cwd?: string, shellMode?: boolean }} [options]
 * @returns {Promise<ExecResult>}
 */
export function exec(command, options = {}) {
  const { timeout = 10_000, cwd, shellMode = false } = options;
  const parts = command.split(/\s+/).filter(Boolean);
  const cmd = shellMode ? parts[0] : resolveCommand(parts[0]);
  const args = parts.slice(1);

  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout, cwd, shell: shellMode, windowsHide: true },
      makeCallback(resolve),
    );
  });
}

/**
 * Run a command given as a cmd + args array (preferred API for caller-controlled values).
 * Always uses shell:false by default — arguments are passed as discrete values, never
 * shell-expanded. Caller-controlled values (owner, repo, model names, etc.) must be passed
 * here, not concatenated into a shell string.
 * For the rare cases that need shell features, pass shellMode:true (validate inputs first).
 *
 * @param {string} cmd - Executable name or path.
 * @param {string[]} args - Arguments as an array (no shell expansion).
 * @param {{ timeout?: number, cwd?: string, shellMode?: boolean }} [options]
 * @returns {Promise<ExecResult>}
 */
export function execArgs(cmd, args = [], options = {}) {
  const { timeout = 10_000, cwd, shellMode = false } = options;
  const resolved = shellMode ? cmd : resolveCommand(cmd);

  return new Promise((resolve) => {
    execFile(
      resolved,
      args,
      { timeout, cwd, shell: shellMode, windowsHide: true },
      makeCallback(resolve),
    );
  });
}
