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
 * Resolve a bare command name on Windows.
 *
 * Returns `{ cmd, needsShell }`:
 *   - cmd:        extension-suffixed name (or input unchanged)
 *   - needsShell: true when the resolved file is .cmd/.bat (Node refuses to
 *                 spawn these without shell:true — spawn EINVAL otherwise).
 *
 * Background: with shell:false (security-hardened default), Node's execFile
 * does NOT consult PATHEXT — `pm2`, `codex`, `gh` etc. are .cmd shims
 * installed by npm and won't be found by bare name. Additionally, Node
 * cannot directly spawn .cmd/.bat files on Windows (per Node docs); they
 * REQUIRE cmd.exe via shell:true to interpret. We use shell:true narrowly
 * for these shim files only, with args passed as an array so Node properly
 * quotes them — preserving most injection safety.
 *
 * @param {string} cmd
 * @returns {{ cmd: string, needsShell: boolean }}
 */
function resolveCommand(cmd) {
  if (process.platform !== "win32") return { cmd, needsShell: false };
  if (isAbsolute(cmd) || cmd.includes(sep)) {
    return { cmd, needsShell: /\.(cmd|bat)$/i.test(cmd) };
  }
  if (/\.(exe|cmd|bat|com)$/i.test(cmd)) {
    return { cmd, needsShell: /\.(cmd|bat)$/i.test(cmd) };
  }
  const exts = [".cmd", ".exe", ".bat", ".com"];
  const dirs = (process.env.PATH || "").split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = `${dir}${sep}${cmd}${ext}`;
      if (existsSync(candidate)) {
        return { cmd: `${cmd}${ext}`, needsShell: ext === ".cmd" || ext === ".bat" };
      }
    }
  }
  return { cmd, needsShell: false }; // give up; execFile will surface ENOENT
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
  const { timeout = 10_000, cwd, shellMode = false, env } = options;
  const parts = command.split(/\s+/).filter(Boolean);
  let cmd = parts[0];
  let useShell = shellMode;
  if (!shellMode) {
    const r = resolveCommand(parts[0]);
    cmd = r.cmd;
    useShell = r.needsShell; // .cmd/.bat REQUIRE shell:true on Windows
  }
  const args = parts.slice(1);

  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout, cwd, env, shell: useShell, windowsHide: true },
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
  const { timeout = 10_000, cwd, shellMode = false, env } = options;
  let resolved = cmd;
  let useShell = shellMode;
  if (!shellMode) {
    const r = resolveCommand(cmd);
    resolved = r.cmd;
    useShell = r.needsShell; // .cmd/.bat REQUIRE shell:true on Windows
  }

  return new Promise((resolve) => {
    execFile(
      resolved,
      args,
      { timeout, cwd, env, shell: useShell, windowsHide: true },
      makeCallback(resolve),
    );
  });
}
