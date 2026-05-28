# Hidden errors — triaged backlog (2026-05-28)

**HEAD:** `41213b0` on `main` (19 commits ahead of origin)
**Audit run:** dual-frame hunt — Frame 2 (silent-failure-hunter, Sonnet) + Frame 1b (security-reviewer, Sonnet substitute after Codex GPT-5.5 wrapper bailed for the third time this project).

**Findings:** 9 unique (zero overlap between frames — lenses were genuinely complementary).

## Priority table

| ID | Sev | Frame | File:Line | Title | Fix this commit? |
|---|---|---|---|---|---|
| F1 | **P0** | F2 | `src/hooks/stop-handler-cli.mjs:4` | Uncaught `JSON.parse` on `CLAUDE_HOOK_EVENT` | YES |
| F2 | **P0** | F2 | `src/hooks/teammate-idle-cli.mjs:4` | Uncaught `JSON.parse` on `CLAUDE_HOOK_EVENT` | YES |
| F8 | **P0** | F1b | `src/setup/doctor.mjs:218` | `CLIPROXY_PORT` default "3284" — outlier; everywhere else is 8317 | YES |
| F3 | P1 | F2 | `src/hooks/stop-handler-cli.mjs:5` | `handleStop` not wrapped; rejection → exit 1 instead of fail-closed 2 | YES |
| F9 | P1 | F1b | `tools/hud-bridge.mjs:64` | Port `Number()` conversion without range validation | YES |
| F6 | P2 | F2 | `CLAUDE.md` | 5 env vars still undocumented after the partial fix this turn | YES (docs-only) |
| F4 | P2 | F2 | `tests/hooks/stop-handler-cli.test.mjs` (missing) | No test file for the CLI wrapper | DEFER |
| F5 | P2 | F2 | `tests/hooks/teammate-idle-cli.test.mjs` (missing) | No test file for the CLI wrapper | DEFER |
| F7 | discuss | F2 | `src/lib/sessions.mjs:84,112` | `catch { continue }` silent-skip inconsistent with `accounts.mjs` post-85f0001 logging | SURFACE |

## Convergence notes

- **Zero direct overlap between frames** — different lenses surfaced different defects. Frame 1b explicitly confirmed `JSON.parse: properly wrapped in try-catch throughout (persist.mjs, accounts.mjs, eval_gate.mjs, config.mjs)` — true for the library code; the CLI wrappers (Frame 2's domain) are a separate gap. Frame 2 didn't audit `tools/` for port validation — Frame 1b's lens. Both frames are correct *within their scope*.
- **F8 pre-spotted independently** in my preparation pass and reconfirmed by Frame 1b — high confidence convergence.
- **Codex GPT-5.5 frame bailed** — third instance of the codex-rescue async-handoff defect. Substitute (`ecc:security-reviewer`) gave a different specialty but same model family; this weakens the dual-model convergence the user originally asked for. Filing under "SOTA-tooling defect" in deep-audit-backlog.

## Deferred (P2) — to track in deep-audit-backlog

- **F4 + F5 — Tests for CLI wrappers:** A top-level-await CLI script is not unit-testable without either an `import.meta.url`-based main guard + extracted function, or a subprocess-spawn integration test that has to be careful not to trigger expensive downstream work (vitest re-entry for `handleTeammateIdle` → `runTestGate`). Worth doing but is its own design decision. Estimated cost: 1 hr.
- **F7 — sessions.mjs silent-skip:** Frame 2 flagged this as `discuss` because the original `catch { continue }` was intentional. After 85f0001 added stderr logging to `accounts.mjs`, the codebase now has two patterns for the same situation. **Operator decision needed**: unify on logging (consistency with 85f0001) or keep silent-skip (intentional ergonomics for cluttered session dirs)?

## Codex tooling defect (separate from app code)

The `codex-rescue` subagent fails to reliably collect its Codex CLI subprocess output. Pattern: wrapper agent runs for ~5 min, returns a placeholder result (`"Task still running. Waiting for completion..."`), no file written. Reproduced **three times** in the past 24h:

1. First Codex frame 3 attempt during MSYS investigation — placeholder, no file.
2. Codex validation call after MSYS evidence summary — placeholder, but file eventually landed.
3. Codex frame 1 attempt during this hidden-error hunt — placeholder, no file.

Cause is plausibly that the wrapper agent uses background-task handoff but doesn't await the subprocess. Fix is upstream in the codex-rescue plugin. For this project's purposes, the workaround is: **use the wrapper only for synchronous validation passes, not for long-running hunts.** A heavy hunt should use `ecc:security-reviewer` / `ecc:silent-failure-hunter` directly.

## What got fixed this commit

See companion commit message: `fix(hidden-errors): close P0/P1 backlog from dual-frame hunt`.
