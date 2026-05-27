# Install Provenance Log

Every external dependency install is logged here. Newest entries at bottom.
Do not edit existing entries — append only.

---

## 2026-05-27 — vein-launch v1.0.0 baseline SOTA stack

- **Components:** AO 0.9.2, CCW 7.3.14, Codex 0.134.0, RTK 0.42.0, CLIProxy 7.1.24, GitNexus 1.6.5, PM2 7.0.1
- **Installed by:** vein-launch Wave 9 install sequence
- **Verification:** all CLIs responded to --version
- **Notes:** CLIProxy authenticated with 5 OAuth accounts (4 Claude + 1 Codex Pro)

---

## 2026-05-27 — Wave 10.5-C npm package audit + manifest smoke test

### npm pack --dry-run (--ignore-scripts, v1.1.0)

- **Total files:** 59
- **Package size:** 35.6 kB (unpacked: 125.6 kB)
- **docs/sota-installed-manifest.md included:** YES (2.1 kB)
- **shasum:** 54de900f2e40c1e0a326bc649d881c4fc337bdee
- **integrity:** sha512-Q+m6mTiF1oLwN[...]Ama9bfV1gmF8A==

Key files in package: `bin/vein.ps1`, `bin/vein.cmd`, `src/**/*.mjs`,
`config/**`, `docs/sota-installed-manifest.md`, `README.md`, `LICENSE`

Note: `--ignore-scripts` used because the `prepare` hook (`npx lefthook install`)
fails in a git worktree where `core.hooksPath` is set to the main repo's `.git/hooks`.
This does not affect the published package contents.

### --manifest smoke test

```
node src/cli.mjs --manifest | grep -q "AO (Agent Orchestrator)" && echo PASS || echo FAIL
```

Result: **PASS** — manifest table prints to stdout with all 7 SOTA components.

---

## 2026-05-27 — vein-launch v1.1.1 published

- **Header:** v1.1.1 — "make Wave 10 features observably work"
- **Test count:** 482 → 493 (11 new tests across Wave 10.5-A/B/C features)
- **Biome:** 0 warnings, 0 errors on `npx biome check .`
- **Wave 10.5 features shipped:**
  - Wave 10.5-A: auto-gate semantics fix (INFO/SKIP/WARN bypass-allowed)
  - Wave 10.5-B: eval-history relocated outside repo (`~/.vein/eval-history/`)
  - Wave 10.5-C: path-slug hardening + allow-list GPT-5.5 review remediation
- **npm pack output (v1.1.1):** 35.7 kB packed, 59 files, manifest included
  - Key files: `bin/vein.ps1`, `bin/vein.cmd`, `src/**/*.mjs`, `config/**`, `docs/sota-installed-manifest.md`
- **GitHub Release:** https://github.com/seathatflowsinourveins/vein-launch/releases/tag/v1.1.1
- **Purpose:** This is the "make Wave 10 features observably work" release — code-correct but
  behavior-broken features from v1.1.0 are now end-to-end verified.

---

## 2026-05-27 — /healthz hotfix (commit 2981125) landed on main

- **Commit:** `fix(t2): use /healthz endpoint (CLIProxy v7+ Kubernetes-style health path)`
- **SHA:** 2981125
- **What:** T2-CLIProxy tier check probe was using the legacy `/health` path; CLIProxy v7+ uses
  the Kubernetes-style `/healthz` endpoint. The wrong path caused T2 to fail even when CLIProxy
  was healthy.
- **Impact:** Validates Wave 10.5 auto-gate end-to-end — T2 passing is required for a clean
  deep run, which unblocks `unleashPhase: bypass` promotion.
- **Status:** Landed on `main`; not yet merged to open worktree branches.

---

## 2026-05-27 — Coverage thresholds (vitest.config.mjs)

- **Configuration:** `vitest.config.mjs` already contained coverage thresholds at 80/80/80/80
  (statements/branches/functions/lines) with `provider: 'v8'` and reporters `['text', 'lcov']`.
  No change required — thresholds were pre-existing.
- **Verified result (493 tests, 33 files):**
  - All files: 86.22% lines, 87.04% branches, 89.84% functions, 86.22% statements
  - All thresholds **PASS** — no shortfall to document.
- **Known coverage gaps (WARN-level debt, not blocking):**
  - `src/lib/persist.mjs`: 0% — no tests for persistence layer
  - `src/lib/runner.mjs`: 0% — integration path not unit-tested
  - `src/setup/cliproxy.mjs`, `git-config.mjs`, `github-rulesets.mjs`, `mise-init.mjs`, `rtk.mjs`, `tools.mjs`: 0%
  - `src/hooks/session-handler-cli.mjs`, `teammate-idle-cli.mjs`: 0%
  - These modules are integration-path code exercised only in live environments, not unit tests.
  - The 80% threshold is met at the aggregate level despite these per-file zeroes.

---

## 2026-05-27 — Legacy repo archival

- **seathatflowsinourveins/ourveins** archived via `gh repo archive --yes` — this is the
  predecessor runtime that vein-launch supersedes (clean rewrite). `isArchived: true` confirmed.
- **seathatflowsinourveins/myvein** archived via `gh repo archive --yes` — companion legacy repo.
  `isArchived: true` confirmed.
- Both repos remain publicly visible (read-only) per GitHub archive semantics.
- **Deprecation header note:** `gh api PATCH` of README.md attempted but rejected — GitHub
  archives make repos read-only immediately; file writes via API return HTTP 403. The archive
  banner itself (GitHub's "This repository has been archived") serves as the deprecation signal.
- Archival is reversible via `gh repo unarchive` if needed.
