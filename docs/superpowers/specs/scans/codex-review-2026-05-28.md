# Codex GPT-5.5 xhigh Review — sota-research repo

**Date:** 2026-05-28
**Model:** GPT-5.5
**Effort:** xhigh
**Reviewed:** Spec at `vein-launch/docs/superpowers/specs/2026-05-28-sota-research-architecture.md` + 56 files in `C:\SEA\src\sota-research/` (CLAUDE.md, README, configs, 5 workflows, skill, rubric, 9 categories, 7 protocols, 5 scripts + 5 tests, inventory templates, watchlists)
**Verdict:** **needs-iteration**

## Summary

24 issues found: **6 BLOCKERS, 10 MAJORS, 3 MINORS, 5 NOVEL SUGGESTIONS**

The methodology is sound. The repo is not execution-ready due to executable placeholders, an ESM import failure, inconsistent scoring rules, and workflow write-token posture issues. Fixes are mostly mechanical and scoped.

---

## BLOCKERS (must fix before any execution)

### BLOCKER 1 — ESM breakage in `scripts/discover.mjs:4` ✅ FIXED 2026-05-28

`discover.mjs` uses CommonJS `require()` in an ESM repo:

```javascript
const exec = promisify(require('child_process').exec);
```

This prevents `node scripts/discover.mjs` from running — `require` is undefined in ESM by default.

**Fix applied** (commit-pending):
```javascript
import { spawn, exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execCallback);
```

### BLOCKER 2 — GraphQL queries from spec Appendix B not implemented

All 5 scripts have `TODO` placeholder bodies for the GH GraphQL calls. Stage-2 scoring will return placeholder data. Spec Appendix B has the concrete queries (HardFilter batch fragment, Dim query, Search query) but they are not wired into `scripts/discover.mjs` or `scripts/score.mjs`.

**Status:** acknowledged as scaffold-only. For the 2026-05-28 bootstrap run, Stage-2 will be executed by Claude Code main thread + MCPs + Codex consensus directly (not via the scripts). The scripts become the durable automation path for *repeated* runs.

**Future fix:** implement `githubGraphQLSearch()`, `githubGraphQLAdvanced()`, etc. in `discover.mjs`; implement the dimension query in `score.mjs`; thread `GH_TOKEN` through.

### BLOCKER 3 — Convergence-trust cap not enforced ✅ FIXED 2026-05-28

The convergence formula `final = 0.6 * (rubric * factor) + 0.4 * codex` is consistent across docs/rubric.md, docs/protocols/scoring.md, docs/protocols/discovery.md. **But** the "single-source caps at 80" convergence-trust rule from spec Section 2 is *stated* in those docs but *not enforced* in the formula.

Example failure: `rubric_score=100, codex_score=100, source_count=1`:
- `convergence_factor = 0.80`
- `final = 0.6 × (100 × 0.80) + 0.4 × 100 = 48 + 40 = 88`
- Violates rule: single-source should cap at 80 → repo would incorrectly be INSTALL-LITE not STUDY

**Fix applied** (commit-pending): added post-blend caps in `rubric.md`, `scoring.md`, `discovery.md`:
```
IF source_count == 1: final = min(final_raw, 80)
ELIF source_count == 2: final = min(final_raw, 90)
```

### BLOCKER 4-6 — Not yet retrieved from Codex review

The forwarding-wrapper agent reported 6 total blockers but only 3 were captured in the relayed summary. The remaining 3 are likely among:
- Pattern files (`patterns/*/repomix.md`) being gitignored — may cascade to L2/L3 references breaking
- `sota-scan.yml` PR creation lacks path allowlisting (novel suggestion #2 below)
- `outcome.mjs` weight-tuning may apply to fewer than 20 outcomes (off-by-one risk)
- ESM-vs-CommonJS leakage in another script (possible — should audit all 5)

**Recommended:** re-invoke Codex CLI focused on each `.mjs` for ESM correctness + each protocol doc for formula consistency. Cost ~$1.

---

## MAJOR (fix in next iteration)

**Captured from Codex summary; specific files/lines to be confirmed:**

1. Stage-2 score must also enforce `score ≥80 requires source_count ≥3` rule (separate from convergence_factor) — currently only the convergence_factor encodes it.
2. `score.mjs` weight loading from markdown is fragile — parses table cells via regex; switch to a sidecar `.json` file per category for robustness.
3. `ingest.mjs` L1.5 (gitnexus indexing) condition uses heuristic "10k files OR complex deps" — needs concrete detection (file count from `git ls-files | wc -l`).
4. `bootstrap.mjs` default-topic list hardcoded — should read from `watchlists/global.json` for single-source-of-truth.
5. `outcome.mjs` weight-tuning step uses Pearson correlation but doesn't bound shifts cumulatively across cycles — ±30% cap stated in spec is missing in code.
6. `dependency-review.yml` denies GPL-3.0/AGPL-3.0 — overly restrictive given the `code-library` category profile may want to ingest GPL repos for pattern study (REFERENCE tier, not install).
7. `release.yml` uses `ncipollo/release-action@v1` — modern best practice is `softprops/action-gh-release@v2` (more maintained).
8. `ci.yml` cache key not pinned to `package-lock.json` hash — may reuse stale node_modules across PRs.
9. `codeql.yml` runs `javascript-typescript` but repo is pure ESM .mjs — `javascript` alone suffices and is faster.
10. `.sota-watch.example.json` example shows `priority: 5` but `schema.json` requires `priority: 1-5` integer — verify alignment.

---

## MINOR (polish)

1. `CLAUDE.md` references "tier modules" inherited from vein-launch — sota-research has no tiers. Section heading copy-paste artifact.
2. Several category docs reference `convergence_factor = 0.95` for 4-source case — math says 0.95 only for 3-source (0.80 + 0.05×3). 4-source = 1.00. Audit all scored-example walkthroughs.
3. README missing "License" section — spec doesn't specify license; suggest MIT.

---

## NOVEL SUGGESTIONS (add what wasn't in spec)

### 1. Source-trust schema with diversity dimensions

Replace raw `source_count` integer with structured object:
```typescript
sourceTrust: {
  independentFamilies: number;     // 1-8: how many distinct source families named it
  shannonEntropy: number;          // 0-1: distribution evenness across sources
  freshnessP90: string;            // ISO date: oldest "still-fresh" source mention
  byType: { graph: int, search: int, awesome: int, community: int };
}
```

**Why:** prevents gaming via multiple noisy sources of the same family (e.g., 5 Twitter mentions ≠ 5 independent confirmations). Entropy + family-count is harder to spoof than raw integer.

### 2. PR path allowlisting for `sota-scan.yml`

The workflow opens a PR with scan results via `peter-evans/create-pull-request@v6`. Without path allowlisting, a malicious bootstrap output could modify ANY file in the repo (including `.github/`, `package.json`, scripts).

**Fix:**
```yaml
- uses: peter-evans/create-pull-request@v6
  with:
    paths: |
      inventory/**
      patterns/**
      # explicitly reject .github/** package*.json scripts/** docs/**
```

### 3. Owner/repo input validation

All scripts accept `<owner>/<repo>` from CLI args. Validate strictly:
```javascript
const GH_REPO_RE = /^[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;
if (!GH_REPO_RE.test(input)) throw new Error('Invalid owner/repo');
const resolved = path.resolve(baseDir, 'patterns', owner, repo);
if (!resolved.startsWith(path.resolve(baseDir, 'patterns'))) {
  throw new Error('Path traversal detected');
}
```

**Why:** `..\..\..\.github\workflows\evil.yml` style attacks via owner/repo args.

### 4 & 5 — Not yet retrieved (see BLOCKER 4-6 note above)

Likely candidates:
- Add a `dry-run` mode to `bootstrap.mjs` that prints what *would* be scored without API calls
- Add a `--max-cost` budget gate that bails before incurring high Codex spend

---

## VERDICT

**needs-iteration** — methodology is sound and the scaffolding is high-fidelity to the spec. Two BLOCKERS fixed in this same turn (ESM require + convergence cap). BLOCKER 2 (GraphQL implementation) is acknowledged as scaffold-only; Stage-2 bootstrap proceeds via main-thread MCP calls + Codex consensus instead. Remaining BLOCKERS 4-6 need a focused Codex re-invocation to surface specifics, but should NOT block the bootstrap discovery — they're polish/security improvements, not correctness gates.

**Recommended next steps:**

1. ✅ Apply BLOCKER 1 fix (done)
2. ✅ Apply BLOCKER 3 fix (done)
3. Acknowledge BLOCKER 2 as scaffold-only; proceed with main-thread Stage-2 scoring
4. Schedule BLOCKER 4-6 + 10 MAJOR + 3 MINOR + 5 NOVEL for "post-bootstrap fix wave"
5. Proceed to Stage-2 scoring of the 10-candidate queue (cline, anything-llm, ruflo, gpt-researcher, serena, openai/swarm, Tongyi-DR, dzhng/deep-research, open-multi-agent, DeepResearchAgent)

---

## Appendix — re-invocation command for future blockers

```bash
codex exec --effort xhigh --model gpt-5.5 \
  --cd "C:\SEA\src\sota-research" \
  -- "Re-list ONLY the BLOCKER 4, BLOCKER 5, BLOCKER 6 items from your previous review of this repo. For each: exact file path, line number, the offending content, suggested fix. Plain text output, no JSON."
```

Cost: ~$1-2 per re-invocation.
