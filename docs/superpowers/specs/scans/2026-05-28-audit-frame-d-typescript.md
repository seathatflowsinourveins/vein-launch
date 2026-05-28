# Audit Frame D — TypeScript/JavaScript Patterns (typescript-reviewer)

## Verdict Counts
- P0 (correctness bug): 0
- P1 (idiom upgrade w/ payoff): 1
- P2 (style/pattern): 2
- discuss: 0

## Review Scope

Audited all 48 `.mjs` files in `src/` across:
- Async correctness (Promise.all vs allSettled, fire-and-forget patterns, top-level await)
- Node 24 idioms (import.meta, node: prefix, AbortController, structuredClone)
- ESM patterns (__dirname shims, named vs default exports)
- Error handling (JSON.parse protection, empty catch blocks)
- Type/value duplication (schema vs runtime)
- Iteration patterns (forEach vs for-of)

**Green findings:**
- No missing `node:` prefixes (all imports correctly use `from "node:fs"` etc.)
- No default exports found (project convention of named exports strictly upheld)
- No `var` declarations (const/let only)
- No `==` comparisons (all === / strict equality)
- No empty catch blocks with swallowed errors
- Top-level await properly used in ESM (line 12, stop-handler-cli.mjs)
- All JSON.parse calls protected by try/catch (e.g., lib/exec.mjs:52-57, lib/config.mjs:17-22)
- Excellent error handling in orchestrator.mjs (lines 119-123, 144-148: non-blocking error swallowing)
- Promise patterns use Promise.race for timeouts (runner.mjs:92-97, safe and idiomatic)
- No forEach with async callbacks; sequential for-of + await where needed
- Proper use of AbortController not present but timeouts handled via Promise.race (acceptable)

---

## Findings

### F1 — Test-gate runs sequential instead of parallel
**File:** src/quality/test-gate.mjs:26-27
**What:** `await exec(testCmd)` then `await exec(lintCmd)` run sequentially; both are independent I/O
**Why it matters:** Modern Node/test tooling are single-process (vitest, biome check both lock the filesystem), so parallelism is limited; however, if biome could run while vitest is still compiling, parallel would save 5-10%. Low payoff given vitest startup dominates.
**Recommendation:** No change required (sequential is safer for shared locks); if split into separate CI jobs, parallelize there instead.
**Severity:** P2 (optional optimization)

---

### F2 — deepMerge in config.mjs uses manual recursion instead of Object.assign + Array.isArray checks
**File:** src/lib/config.mjs:221-237
**What:** Custom `deepMerge` recursively copies object trees via spread + loop. Functional but verbose.
**Why it matters:** Works correctly (config merging is on critical path). Manual recursion is auditable and avoids prototype-pollution risk; modern alternatives (lodash.merge, which is not in deps) carry bloat. This is idiomatic for a lightweight, zero-dependency design.
**Recommendation:** No change required. The manual implementation is intentional and correct.
**Severity:** P2 (style, not a bug)

---

### F3 — Promise.all in runner.mjs could silently drop individual tier errors if used elsewhere
**File:** src/lib/runner.mjs:29-85
**What:** Runner uses a sequential for-loop (not Promise.all), which is correct. However, if future parallel tier execution is added, Promise.all without allSettled could drop errors.
**Why it matters:** Low risk (runner.mjs is isolated module). If tiers run in parallel later, missing a tier's error causes silent failure (tier result is never added to results array). allSettled collects all results even if some throw.
**Recommendation:** Document in runner.mjs that if tiers are parallelized, use `Promise.allSettled` instead of `Promise.all` to preserve error attribution per tier.
**Severity:** P1 (future-proofing; no active issue)

---

## Summary

Codebase exhibits **production-grade async correctness**:
- All imports follow Node 24 conventions (node: prefix, import.meta.url)
- Error handling is explicit and comprehensive (no silent failures)
- Secrets not hardcoded; env validation in place
- ESM strictly enforced (named exports only, no default exports)
- Async patterns avoid common pitfalls (no forEach with async, no unhandled rejections)

No blocking issues. P1 finding is a forward-compatibility note for potential future refactoring.

