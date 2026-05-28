# Hidden errors — Frame 2 (silent-failure + test-gaps)

## Verdict counts
- P0: 2 (uncaught JSON.parse errors that crash instead of failing gracefully)
- P1: 1 (missing error propagation in hook with no observability)
- P2: 3 (test coverage gaps + config drift in environment variables)
- discuss: 1 (design question on error context in sessions cleanup)

## Findings

### F1 [P0] — Uncaught JSON.parse in stop-handler-cli.mjs
**File:** `C:\SEA\src\vein-launch\src\hooks\stop-handler-cli.mjs:4`
**What:** `JSON.parse(process.env.CLAUDE_HOOK_EVENT || "{}")` throws unhandled SyntaxError if env var contains malformed JSON.
**Why it matters:** Malformed env var from parent process (Claude hook system) causes hook crash with no stderr context, making Claude Code unresponsive to stop events.
**Reproducer/test:** Set `CLAUDE_HOOK_EVENT="[invalid json"` and invoke hook CLI.
**Recommendation:** Wrap in try-catch: `const event = (() => { try { return JSON.parse(process.env.CLAUDE_HOOK_EVENT || "{}"); } catch { return {}; } })();`

### F2 [P0] — Uncaught JSON.parse in teammate-idle-cli.mjs
**File:** `C:\SEA\src\vein-launch\src\hooks\teammate-idle-cli.mjs:4`
**What:** `JSON.parse(process.env.CLAUDE_HOOK_EVENT || "{}")` throws unhandled SyntaxError if env var contains malformed JSON.
**Why it matters:** Same as F1: unhandled crash prevents agent team idle checks from completing.
**Reproducer/test:** Set `CLAUDE_HOOK_EVENT="{"` and invoke hook CLI.
**Recommendation:** Wrap in try-catch with same pattern as F1.

### F3 [P1] — Missing error propagation in stop-handler-cli.mjs
**File:** `C:\SEA\src\vein-launch\src\hooks\stop-handler-cli.mjs:5`
**What:** `await handleStop(event, { skipReview: !process.env.CODEX_STOP_REVIEW })` can throw but no catch wraps it; line 8 exits with code 2 only if `result.blockers > 0`.
**Why it matters:** If handleStop rejects (e.g., network error in runCodexReview), the unhandled promise rejection will crash the hook with exit code 1 instead of failing closed with exit code 2.
**Reproducer/test:** Inject a failing promise in runCodexReview and trigger stop event.
**Recommendation:** Wrap handleStop call in try-catch at file scope (similar to teammate-idle.mjs which already does this at line 57).

### F4 [P2] — No test file for stop-handler-cli.mjs
**File:** `C:\SEA\src\vein-launch\src\hooks\stop-handler-cli.mjs`
**What:** The CLI entry point has no corresponding `.test.mjs` file; stop-handler.mjs is tested but not the CLI wrapper.
**Why it matters:** JSON.parse error case (F1) and unhandled rejection case (F3) are not covered by any vitest assertions.
**Reproducer/test:** Look for `tests/hooks/stop-handler-cli.test.mjs` — does not exist.
**Recommendation:** Create `tests/hooks/stop-handler-cli.test.mjs` with tests for: (1) malformed CLAUDE_HOOK_EVENT, (2) unhandled promise rejection from handleStop.

### F5 [P2] — No test file for teammate-idle-cli.mjs
**File:** `C:\SEA\src\vein-launch\src\hooks\teammate-idle-cli.mjs`
**What:** The CLI entry point has no corresponding `.test.mjs` file; teammate-idle.mjs is tested but not the CLI wrapper.
**Why it matters:** JSON.parse error case (F2) is not covered by any vitest assertion.
**Reproducer/test:** Look for `tests/hooks/teammate-idle-cli.test.mjs` — does not exist.
**Recommendation:** Create `tests/hooks/teammate-idle-cli.test.mjs` with tests for: (1) malformed CLAUDE_HOOK_EVENT, (2) expected exit codes on pass/fail.

### F6 [P2] — Config drift: Environment variables not documented in CLAUDE.md
**File:** `C:\SEA\src\vein-launch\CLAUDE.md` (missing section) and code references: `src/setup/doctor.mjs`, `src/setup/first-time.mjs`, `src/lib/exec.mjs`, `src/tiers/t1-env.mjs`, `src/hooks/stop-handler.mjs`, `src/setup/index.mjs`
**What:** The following environment variables are used in code but not documented in CLAUDE.md: `CLIPROXY_PORT`, `CLAUDE_AI_TOKEN`, `CLAUDE_ACCESS_TOKEN`, `CODEX_STOP_REVIEW`, `WSL_DISTRO_NAME`, `ENABLE_TOOL_SEARCH`.
**Why it matters:** Users cannot discover available configuration options via the main documentation. Maintenance burden increases when env var references drift from docs.
**Reproducer/test:** Search CLAUDE.md for each variable — all 6 are absent.
**Recommendation:** Add an "Environment Variables" section to CLAUDE.md documenting the public-facing vars (CLIPROXY_PORT, CODEX_STOP_REVIEW) with default values and purpose. Internal/diagnostic vars (VEIN_LAUNCHED, VEIN_PROJECT, CLAUDE_HOOK_EVENT) can be marked as internal-use-only.

### F7 [discuss] — sessions.mjs catches and silently continues on corrupt JSON
**File:** `C:\SEA\src\vein-launch\src\lib\sessions.mjs:84,112`
**What:** `catch { continue }` in loops (listSessions, cleanSessions) skips corrupt session files silently without warning.
**Why it matters:** A user with a corrupted session file in ~/.vein/sessions/ will not be informed of the issue; the file will silently disappear on cleanSessions call.
**Reproducer/test:** Create a `.json` file in ~/.vein/sessions/ with invalid JSON; call listSessions() and cleanSessions().
**Recommendation:** Consider: (1) log a stderr warning (like accounts.mjs does after fix 85f0001), or (2) return the corrupt path in a separate result field so caller can decide on action. Current silent skip is more lenient than accounts.mjs pattern; consistency would be better.

## Summary
Two P0 uncaught JSON.parse exceptions in hook CLI entry points are the primary risk. Both can be fixed with minimal defensive try-catch wrapping. Test coverage for these files is absent. The sessions.mjs silent skip is intentional (comments say "skip silently") but inconsistent with the accounts.mjs error pattern (now that 85f0001 added logging); worth a design decision on consistency across the codebase. Config drift on 6 environment variables should be addressed with documentation.
