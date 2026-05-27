/**
 * Safe child_process wrapper with timeout support.
 */

import { execFile } from "node:child_process";

export function exec(command, options = {}) {
  const { timeout = 10_000, cwd } = options;

  return new Promise((resolve) => {
    execFile(
      command.split(/\s+/)[0],
      command.split(/\s+/).slice(1),
      { timeout, cwd, shell: true, windowsHide: true },
      (err, stdout, stderr) => {
        if (err?.killed) {
          resolve({ ok: false, stdout: "", stderr: "", exitCode: -1, timedOut: true });
          return;
        }
        const exitCode = err?.code ?? 0;
        resolve({
          ok: exitCode === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode,
          timedOut: false,
        });
      },
    );
  });
}
