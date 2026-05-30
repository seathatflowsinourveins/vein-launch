# Audit Frame C — Silent Failures (silent-failure-hunter)

**Audit date:** 2026-05-28  
**HEAD:** 781f47a  
**Branch:** main  
**Scope:** FRAME C of 6-frame parallel audit (other frames: A=Codex, B=security, D=TS/async, E=architecture, F=SOTA research)

## Verdict counts
- **P0** (data-loss/wrong-result): **0**
- **P1** (missing propagation): **0**
- **P2** (test gap / error-message quality): **0**
- **discuss**: **0**

## Summary

MAX-DEPTH silent-failure audit of vein-launch at HEAD=781f47a completed with **CLEAN** verdict.

Codebase exhibits disciplined error handling across all 9 audited layers:
- ✓ No empty catch blocks
- ✓ No catch-return-false/null patterns without documentation
- ✓ All Promise chains properly awaited
- ✓ All Promise.all() calls wrapped in try/catch or contained error handlers
- ✓ Error messages include context (path, error code, underlying cause)
- ✓ Repair functions fail closed (never silently succeed on partial repair)
- ✓ Promise rejections properly handled in async tools
- ✓ CLI entry points catch top-level and exit with code 2

## Audited scope (9 layers)

### 1. **src/tiers/** (T0-T6)
- t0-rtk.mjs, t1-env.mjs, t2-cliproxy.mjs, t3-cli.mjs, t4-github.mjs, t5-drift.mjs, t6-codegraph.mjs
- **Finding:** All tier error paths properly emit evidence with remediation context. Repair handlers fail closed.

### 2. **src/lib/** (Runtime core)
- runner.mjs, reporter.mjs, json-reporter.mjs, manifest.mjs, unleash-gate.mjs, block-engine.mjs, sessions.mjs, persist.mjs, config.mjs, result.mjs, shell.mjs, exec.mjs
- **Finding:** getRecentRuns() logs warnings on corrupt run files (line 56); sessions.mjs documents continue behavior for corrupt JSON (line 85 comment); all error paths preserved with stack context.

### 3. **src/hooks/** (Claude Code integrations)
- stop-handler-cli.mjs, stop-handler.mjs, teammate-idle-cli.mjs, teammate-idle.mjs, session-start.mjs
- **Finding:** All CLI entry points wrap async handlers in try/catch and exit(2) on error. stop-handler.mjs fails closed when Codex review throws.

### 4. **src/quality/** (Quality gates)
- codex-review.mjs, ship-gate.mjs, test-gate.mjs
- **Finding:** All gate handlers properly return failure codes. Ship-gate counts findings correctly even when one model fails.

### 5. **src/cliproxy/** (CLIProxy management)
- pm2.mjs, manager.mjs, accounts.mjs, docker.mjs, cache-check.mjs, config-gen.mjs
- **Finding:** pm2.mjs parseJson returns null on error (intentional safe parse). accounts.mjs write is atomic (per 85f0001 commit). countCliproxyAccounts throws on errors other than ENOENT (propagates to caller).

### 6. **src/setup/** (Bootstrap & configuration)
- first-time.mjs, doctor.mjs, git-config.mjs, github-rulesets.mjs, tools.mjs, rtk.mjs, cliproxy.mjs, mise-init.mjs, index.mjs
- **Finding:** first-time.mjs catches only ENOENT on .vein.json (fails closed on other errors, per commit message documentation). doctor.mjs validates CLI output before parsing.

### 7. **tools/** (CLI utilities)
- hud-bridge.mjs, eval_gate.mjs, behavioral_eval.mjs, worktree-cleanup.mjs, instrument-check.mjs
- **Finding:** eval_gate.mjs throws on behavioral runner failure (Wave 11 fix, line 235). behavioral_eval.mjs throws on JSON parse failure. worktree-cleanup.mjs returns { error, removed, skipped } on failure. hud-bridge.mjs polls in try/catch loop (line 256-262).

### 8. **src/project-config.mjs** (Project registry)
- **Finding:** loadRegistry returns {} on missing file (first-run state, documented). resolveProject has extended try/catch for realpathSync with fallback to resolve() (documented, lines 94-101, allows NFS/CI bootstrap).

### 9. **src/team.mjs** (Team management)
- **Finding:** loadTeamConfig returns null on missing file (expected state). saveTeamConfig returns error object rather than throwing.

## Verified patterns

### ✓ Acceptable "silent" defaults (all documented)

| File | Line | Pattern | Rationale |
|------|------|---------|-----------|
| pm2.mjs | 95-99 | `parseJson` catch → null | Safe JSON parse; upstream handles null |
| project-config.mjs | 20-24 | `loadRegistry` catch → {} | First-run state; no file = empty registry |
| project-config.mjs | 94-101 | `realpathSync` catch → resolve() | Allows deferred paths for NFS/CI bootstrap (documented) |
| team.mjs | 86-89 | `loadTeamConfig` catch → null | Missing file expected; null is valid signal |
| sessions.mjs | 84-86 | JSON.parse catch → continue | Robust: skip one corrupt file, process rest (documented) |
| first-time.mjs | 132 | `readFile` catch → "" | Optional file; empty default valid |
| t5-drift.mjs | 70-71 | cache parse catch → null | Non-fatal; recompute on miss |
| unleash-gate.mjs | 75-81 | readFile/parse catch → skip | Fail-safe for corrupt history (allows partial data) |
| hud-bridge.mjs | 54-55 | config load catch → {} | Optional config; defaults applied |
| persist.mjs | 54-56 | JSON.parse catch → warn + skip | Logs warning; continues with other runs |

### ✓ Fail-closed repair handlers

| File | Line | Behavior |
|------|------|----------|
| t4-github.mjs | 177-192 | `gh auth refresh` failure → BLOCK (never silent success) |
| t0-rtk.mjs | 95-112 | `rtk init -g` failure → BLOCK severity |
| t6-codegraph.mjs | 65-79 | `gitnexus analyze` failure → BLOCK + remediation |

### ✓ Promise handling

| File | Line | Pattern | Status |
|------|------|---------|--------|
| runner.mjs | 92-97 | Promise.race() with timeout | ✓ Properly awaited in try/catch |
| quality/ship-gate.mjs | 68-71 | Promise.all() parallel reviews | ✓ Properly awaited; failure handling at 73-76 |
| t4-github.mjs | 131, 196 | Promise.all() | ✓ Results inspected; errors propagated |
| eval_gate.mjs | 232-236 | Behavioral runner rejection | ✓ Throws with context (Wave 11 fix) |

### ✓ Error message quality

All error messages include context:
- `actual`, `expected`, `remediation` fields in evidence objects
- Error code or message in catch handlers
- Path or identifier in logs
- Stack trace preserved in diagnostics fields

Example (**t2-cliproxy.mjs:220**):
```js
actual: `Failed to enumerate auth-dir: ${err.code ?? err.message}`
```

## Tests verified

1. **eval_gate.mjs** (lines 145-156) — vitest JSON parsing guards against empty stdout; throws if no JSON
2. **behavioral_eval.mjs** (lines 84-87, 147-150) — JSON parse failures throw with context
3. **worktree-cleanup.mjs** (lines 202-212) — git worktree remove failures caught; reported as skipped, not silent
4. **persist.mjs** (lines 52-57) — corrupt run files logged; don't crash trend analysis

## Prior commits confirmed

✓ 85f0001 (atomic JSON write + JSON.parse guards)  
✓ 9f1687a (t2-cliproxy: /healthz confirmation before reporting down)  
✓ 0bc5001 (t4-github: fail closed on gh auth refresh failure)  
✓ fe9ec35 (eval-gate: fail closed on init failure)  
✓ 1045f1c (stop-handler-cli + teammate-idle-cli JSON.parse guards)  

All fixes remain in place; no regressions detected.

## Conclusion

**Zero findings.** Codebase demonstrates max-depth error handling discipline across all 9 layers. All intentional defaults are documented. All error propagation preserves context. All repair handlers fail closed. Silent failures audit is CLEAN.

---

**Frame Status:** Ready for merge. No open items for Frame C.
