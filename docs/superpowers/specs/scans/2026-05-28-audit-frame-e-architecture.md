# Audit Frame E — Architecture (architect)

**Note:** Agent had no Write tool; this report was inlined in its return and saved manually. F1 verified empirically and corrected (see editor's note).

## Verdict counts (corrected after live verification)
- P0 (broken-contract / data-loss): 0  *(Frame E claimed 1; verified as false positive — see F1 note)*
- P1 (design weakness with payoff): 3
- P2 (style / convention): 2  *(F1 downgraded here)*
- discuss: 0

## Findings

### F1 [P2] — sessions.mjs uses `crypto.randomUUID()` without explicit import
**File:** `src/lib/sessions.mjs:53`

**What:** `crypto.randomUUID()` is called without `import { randomUUID } from "node:crypto"`. Frame E claimed this was a P0 runtime ReferenceError.

**Editor's correction:** Verified empirically — Node 24.14 exposes `crypto` as a global per WHATWG Web Crypto API (added in Node 19, [docs](https://nodejs.org/api/globals.html#crypto_1)). `node -e 'crypto.randomUUID()'` returns a valid UUID. Tests pass (662/662) confirming `createSession()` works in production. **Not a runtime defect.**

**Why it still matters (downgraded):** Explicit imports communicate intent and don't rely on a Node version-dependent implicit global. The same maintainability argument that warrants `import { existsSync } from "node:fs"` warrants `import { randomUUID } from "node:crypto"`.

**Recommendation:** Add `import { randomUUID } from "node:crypto";` near the existing imports and call `randomUUID()` directly. Single-line diff.

---

### F2 [P1] — TIER_MODULES duplication between runner.mjs and tiers/index.mjs
**Files:** `src/lib/runner.mjs:8-16`, `src/tiers/index.mjs:5-12`

**What:** Tier registry is maintained in two places with different path resolutions:
- `src/tiers/index.mjs` exports `TIERS` (relative-to-tiers/ paths: `"./t0-rtk.mjs"`)
- `src/lib/runner.mjs` has `TIER_MODULES` (relative-to-lib/ paths: `"../tiers/t0-rtk.mjs"`)

Both list the same 7 IDs (t0-rtk through t6-codegraph). Adding/renaming a tier requires updating both.

**Why it matters:** Duplication creates a merge-conflict vector and silent-skip risk: a forgotten update to one map means the orchestrator and the loader disagree about which tiers exist. The block-engine and severity logic depend on `runTiers` ordering, so a divergence could result in some tiers not running while the manifest reports them as present.

**Recommendation:** Delete `TIER_MODULES` from `runner.mjs`. Import `TIERS` from `tiers/index.mjs` (already exports `loadTier(id)`), and use `loadTier(entry.id)` instead of `import(TIER_MODULES[id])`. Single source of truth.

---

### F3 [P1] — Import-after-export in unleash-gate.mjs
**File:** `src/lib/unleash-gate.mjs:25,27-28`

**What:** Line 25 `export const OPERABLE_SEVERITIES = new Set(...)` precedes the imports on lines 27-28 (`readdir`, `readFile`, `join`).

**Why it matters:** Node ESM hoists `import` declarations, so this doesn't cause a runtime error — but it violates module convention, confuses static analysis (linters/IDE organizers expect imports first), and risks future tooling failures. Biome's `organizeImports` rule would auto-fix this if enabled.

**Recommendation:** Move the two import statements to the top of the file, immediately after the module docstring (line ~13). Two-line move.

---

### F4 [P1] — Hardcoded C:/SEA path in config.mjs
**File:** `src/lib/config.mjs:141`

**What:** `resolveProject(name)` candidates include a hardcoded `resolve('C:/SEA/src/${name}')`. The path is the operator's local machine layout.

**Why it matters:** The launcher is not portable to other machines, CI runners, or environments with different project layouts. For another developer (or for moving the operator's projects), the resolution silently fails and the project is unresolved. This contradicts the project's "no stale references" rule from CLAUDE.md.

**Recommendation:** Read from an env var with a sensible default:
```js
const projectsRoot = process.env.VEIN_PROJECTS_ROOT ?? join(homedir(), "SEA", "src");
const candidates = [resolve(projectsRoot, name), resolve(process.cwd(), name)];
```
Plus document `VEIN_PROJECTS_ROOT` in CLAUDE.md's "Other env vars" section.

---

### F5 [P2] — Port 8317 hardcoded in 5 locations
**Files:** `tools/hud-bridge.mjs:25`, `src/lib/exec.mjs` (check line), `src/tiers/t2-cliproxy.mjs:152`, `config/default.json:36`, `config/schema.json:41`

**What:** The CLIProxy default port is duplicated across 5 files. `CLIPROXY_PORT` env var is respected at each site, but the *default* value is fragmented.

**Why it matters:** This was the exact failure mode in `doctor.mjs:218` (recently fixed in `1045f1c` — default had drifted to "3284"). Same shape, same risk for other call sites.

**Recommendation:** Add a single export in `src/lib/result.mjs` (or a new `src/lib/constants.mjs`):
```js
export const DEFAULT_CLIPROXY_PORT = 8317;
```
Import where needed. Reduces 5 hardcoded constants to 1.

---

## Architectural strength assessment (Frame E's positive findings)

| Aspect | Verdict | Notes |
|---|---|---|
| Tier-Module Contract | ✓ Solid | All 7 tiers correctly export `{ meta, check, repair }`; `createResult()` validates |
| Layering / Dep direction | ✓ Clean | Tiers → lib → orchestrator; no cycles. Exception: F2 duplication |
| Config Single Source of Truth | ✓ Good | schema + default + runtime in sync, except F5 port drift |
| Hidden Coupling | ✓ Minimal | Env vars documented in CLAUDE.md |
| Mode Router | ✓ Centralized | orchestrator.mjs + meta.modes per tier |
| Hook Surface | ✓ Clean | `*-cli.mjs` thin wrappers; logic in `*.mjs` |
| Tools vs src/ boundary | ✓ Principled | tools/ are standalone utilities, no reverse deps into src/ |
| Test Coverage | ✓ Mirrored | tests/ mirrors src/ structure; no orphans |

---

## Summary

5 findings, 1 P0→P2 corrected after empirical verification. No design refactoring needed.

| # | Severity | Type | Fix effort |
|---|---|---|---|
| F1 | P2 (was P0) | Clarity | 2-line diff |
| F2 | P1 | Maintenance | ~10-line diff |
| F3 | P1 | Convention | 2-line move |
| F4 | P1 | Portability | ~5-line diff + docs |
| F5 | P2 | DRY | New constants file + 5 import lines |

**Convergence value:** Frame E was solid on design assessment but produced one false-positive runtime claim. Demonstrates why every "P0 runtime ReferenceError" must be verified against the live system — single-frame conclusions are not safe.
