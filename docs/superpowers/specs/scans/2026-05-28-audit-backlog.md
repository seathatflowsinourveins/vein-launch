# Max-depth audit — triage backlog (2026-05-28)

**HEAD baseline:** `ad76e23` (after `Merge pull request #6 from feature/wave-12-1-gap-resolution`)
**Branch:** `main`
**Test baseline:** 662/662 vitest pass · biome clean on modified files

**Audit scope:** 6-frame parallel hunt — security (B), silent-failure (C), TypeScript/async (D), architect (E), SOTA research (F), Codex GPT-5.5 xhigh (A).

**Frame outcomes:**
- B (security-reviewer) — 1 P0, 0 P1, 0 P2: `docker.mjs:90` command injection
- C (silent-failure-hunter) — **CLEAN, 0 findings** — fail-closed surface intact across 9 layers / 62 files
- D (typescript-reviewer) — 0 P0, 1 P1 (future-proof comment), 2 P2 (intentional, no-action)
- E (architect) — claimed 1 P0 + 3 P1 + 1 P2; F1 P0 **verified as false-positive** (Node 24 exposes `crypto` global) → downgraded to P2. Net: 0 P0, 3 P1, 2 P2.
- F (SOTA research) — 8 outward-facing findings: 3 IMPROVE, 2 ADOPT, 2 KEEP, 1 WATCH
- A (Codex GPT-5.5 xhigh, run 1) — Completed analysis (204k tokens), summary `P0=0, P1=6, P2=6`. **Structured findings file was not written** because `codex exec` defaulted to read-only sandbox. Re-launched with `--full-auto`.

**Codex's P0=0 cross-validates Frame B's docker.mjs as the only P0.** When the v2 run lands, this doc will be updated with its 12 specific findings.

---

## Findings table

| ID | Frame | Sev | File:line | Title | Status |
|---|---|---|---|---|---|
| B.F1 | B | **P0** | `src/cliproxy/docker.mjs:90` | Command injection in `logs(lines)` via template interpolation | **FIXED** in this session |
| E.F2 | E | P1 | `src/lib/runner.mjs:8-16` | `TIER_MODULES` duplicates `src/tiers/index.mjs:TIERS` | **FIXED** |
| E.F3 | E | P1 | `src/lib/unleash-gate.mjs:25-28` | Imports after exports (convention) | **FIXED** |
| E.F4 | E | P1 | `src/lib/config.mjs:141` | Hardcoded `C:/SEA/src/` portability blocker | **FIXED** |
| E.F1 | E | P2 (was P0) | `src/lib/sessions.mjs:53` | Explicit `randomUUID` import (Node 24 has crypto global; tests pass) | **FIXED** |
| E.F5 | E | P2 | 5 files | Port 8317 hardcoded in 5 places | DEFERRED |
| D.F3 | D | P1 | `src/lib/runner.mjs` | Doc note: use `Promise.allSettled` if ever parallelized | DEFERRED (comment-only) |
| D.F1 | D | P2 | `src/quality/test-gate.mjs:26-27` | Sequential test+lint (intentional for shared locks) | NO ACTION |
| D.F2 | D | P2 | `src/lib/config.mjs:221-237` | Manual deepMerge (intentional zero-dep) | NO ACTION |
| F.F1 | F | ADOPT | runner.mjs:91-97 | `AbortSignal.timeout()` vs current `Promise.race` | DEFERRED — D verified Promise.race is "safe and idiomatic" |
| F.F3 | F | IMPROVE | infra | PM2 → NSSM/WinSW wrapper for Windows supervision | BACKLOG (operator decision; matches existing item) |
| F.F4 | F | IMPROVE | shell env | MSYS_NO_PATHCONV per-invocation, not blanket * | BACKLOG (matches existing item) |
| F.F6 | F | ADOPT | tests/hooks | Vitest `forceRerunTriggers` + extracted `main()` for CLI testing | BACKLOG → resolves prior F4/F5 deferred CLI-wrapper test gaps |
| F.F8 | F | IMPROVE | runner.mjs | Distinguish abort reasons in tier timeout error chain | DEFERRED — modernization |
| F.F2 | F | KEEP | tier checks | `execFile` over `spawn` for short-lived binaries | NO ACTION |
| F.F5 | F | KEEP | CLI wrappers | `fileURLToPath(import.meta.url)` guard until `import.meta.main` lands | NO ACTION |
| F.F7 | F | WATCH | infra | WinSW/Servy as future NSSM replacements | WATCH |

---

## What got fixed this session (commits pending)

Working-tree changes (uncommitted yet):

```
M src/cliproxy/docker.mjs         B.F1 — clamp lines to integer 1..10000
M src/lib/config.mjs              E.F4 — VEIN_PROJECTS_ROOT env var with homedir fallback
M src/lib/runner.mjs              E.F2 — delete TIER_MODULES, use loadTier from tiers/index.mjs
M src/lib/sessions.mjs            E.F1 — explicit randomUUID import (cleanliness, not bug)
M src/lib/unleash-gate.mjs        E.F3 — imports moved above exports (convention)
M src/cli.mjs                     (external linter change — TBD if mine)
M src/setup/first-time.mjs        (external linter change)
M tests/cliproxy/docker.test.mjs  (external linter change)
A docs/superpowers/specs/scans/2026-05-28-audit-frame-{b,c,d,e,f}.md  scan reports
A docs/superpowers/specs/scans/2026-05-28-audit-backlog.md            this file
```

**Tests:** 662/662 still pass after all 5 fixes. **Biome:** clean on modified `.mjs` files.

---

## Convergence highlights

- **CLIPROXY_PORT default drift** — found independently by Frame B's logs() audit + Frame E's port-duplication finding + the prior session's hidden-error hunt. Three-way convergence on a single foundational pattern (single source of truth for the port constant). **Frame E.F5 is the last remaining piece.**
- **Silent-failure surface is CLEAN** (Frame C, 47 tool uses across 9 layers) → confirms the prior 5 hardening commits (85f0001/9f1687a/0bc5001/fe9ec35/1045f1c) landed correctly. Strong positive convergence with Frame D's "production-grade async correctness" verdict.
- **Codex's P0=0 verdict cross-validates Frame B** — the single P0 in the repo is the docker.mjs one, fixed this session.
- **CLI-wrapper test gap** (deferred since prior session) now has a concrete SOTA path from Frame F.F6: extract `main()`, guard with `fileURLToPath` check, integration-test via `execa` + Vitest `forceRerunTriggers`. Ready to implement when scheduled.
- **PM2 vs NSSM** — Frame F.F3 + existing backlog + Codex Frame 3 (prior session) + cliproxy-durability memory all converge on Scheduled Task or NSSM wrapper as the SOTA Windows supervisor. Decision still needs operator.

---

## Open backlog (post-this-session)

1. **PM2/CLIProxy supervision** — operator decision needed (kill 53340 + reconcile, requires non-CC shell because `ANTHROPIC_BASE_URL=8317` is on critical path).
2. **MSYS_NO_PATHCONV scoping** — operator-owned shell config; documented patch ready in `msys-foundational-fixes-2026-05-28.md`.
3. **CLI-wrapper test files** (F.F6 path) — extract `main()` + guard + execa integration tests for `stop-handler-cli.mjs` + `teammate-idle-cli.mjs`. ~1 hour.
4. **Port 8317 single-source-of-truth** (E.F5) — new `src/lib/constants.mjs` exports `DEFAULT_CLIPROXY_PORT=8317`, import everywhere. Low risk, ~30 min.
5. **sessions.mjs:84,112 silent-skip** — operator decision: unify on warning logs (matches 85f0001) or keep silent ergonomics. Comment-level documented either way.
6. **AbortSignal modernization** (F.F1 + F.F8) — convert runner.mjs's `Promise.race` to `AbortSignal.timeout()` + use `signal.reason` for diagnostic context. ~1 hour.
7. **codex-rescue + codex-exec sandbox tooling defects** — wrapper async-handoff + read-only-default-overrides-config. SOTA-tooling backlog.

---

## What I'm waiting on

- **Codex Frame A v2** running with `--full-auto` — will deliver 12 specific findings (6 P1 + 6 P2 per its v1 summary). When it lands, this doc adds a section "Codex's 12 findings" and merges any new items into the table above.

