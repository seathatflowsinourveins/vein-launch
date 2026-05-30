# Audit Frame B — Security/Windows (security-reviewer)

## Verdict counts
- P0 (exploitable/data-loss): 1
- P1 (correctness/defense-in-depth): 0
- P2 (style/maintainability): 0
- discuss: 0

## Findings

### F1 [P0] — Command injection in docker.mjs logs function via unvalidated numeric parameter

**File:** `src/cliproxy/docker.mjs:90`

**What:** The `logs(lines)` function interpolates the `lines` parameter directly into a shell command string passed to `exec()`, allowing arbitrary command injection.

**Why it matters:** Although the parameter has a default numeric value (50) and type hint `@param {number}`, JavaScript enforces no runtime type checking. A caller could invoke `logs("${IFS}rm${IFS}-rf${IFS}/")` or any shell metacharacters, causing the injected command to execute via the shell when `exec()` parses the string by whitespace. The shell-unsafe default behavior of `exec()` in shell.mjs (which parses by splitting on whitespace without quoting dynamic values) makes this exploitable.

**Reproducer:**
```javascript
// In manager.mjs or any caller:
const result = await getProxyLogs(config, "50; rm -rf /tmp/test #");
// Executed as: `wsl docker compose -f ~/docker/cliproxy/compose.yml logs --tail 50; rm -rf /tmp/test #`
```

**Recommendation:** Use the `execArgs()` API (array form) instead of `exec()` string form:

```javascript
export async function logs(lines = 50) {
  // Coerce to safe numeric string to prevent injection
  const safeLines = String(Math.max(1, Math.min(Number(lines) || 50, 10000)));
  const result = await execArgs("wsl", [
    "docker", "compose", "-f", "~/docker/cliproxy/compose.yml",
    "logs", "--tail", safeLines
  ]);
  return { stdout: result.stdout, stderr: result.stderr };
}
```

Or validate + coerce before interpolation (simpler):
```javascript
export async function logs(lines = 50) {
  const safeLines = Number.isSafeInteger(lines) && lines > 0 ? lines : 50;
  const result = await exec(`wsl docker compose -f ~/docker/cliproxy/compose.yml logs --tail ${safeLines}`);
  return { stdout: result.stdout, stderr: result.stderr };
}
```

---

## Summary

One command-injection vulnerability identified in the docker provider's logs function. The vulnerability stems from dynamic parameter interpolation in a shell command string. No other OWASP Top 10 issues detected:

- **Injection (other)**: All other shell calls use safe APIs (execArgs with array-form arguments, hardcoded commands, or validated inputs).
- **Broken Auth**: GitHub auth scopes validated correctly; API keys use sk- prefix validation and secure storage.
- **Sensitive Data**: Env vars protected; no hardcoded secrets; accounts.json uses atomic writes.
- **Path Traversal**: Config.mjs enforces symlink checks, size limits, and validates .vein.json; worktree-cleanup uses realpath validation.
- **XSS**: Not applicable (backend service).
- **Secrets in Code**: No API keys, tokens, or credentials hardcoded; env var handling correct.
- **PowerShell Hardening**: bin/vein.ps1 uses array splatting (@nodeArgs), no string interpolation of dynamic values, proper $PSNativeCommandArgumentPassing set.
- **Windows Reserved Names**: Untracked `nul` file in git status is a filesystem artifact (Windows reserved name), not a code security issue.

All exec-based calls validated:
- `exec()` used only with hardcoded command strings (t4-github, t3-cli, etc.) ✓
- `execArgs()` used correctly for PM2 calls (pm2.mjs) with array-form args ✓
- spawnSync in exec.mjs uses shell:false ✓
- eval_gate.mjs, hud-bridge.mjs, worktree-cleanup.mjs all safe ✓

