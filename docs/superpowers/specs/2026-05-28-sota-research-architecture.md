# SOTA Research Architecture — design spec

> **Authored:** 2026-05-28. Brainstorming skill → `superpowers:brainstorming`.
> **Status:** SPEC COMPLETE — executing immediately per user authorization ("full automation resolve all").
> **Repo target:** `C:\SEA\src\sota-research/`
> **Spec doc location:** `vein-launch/docs/superpowers/specs/` (this file)

## Overview

This is a **methodology + artifact repo**, not a runtime application. Lives at
`C:\SEA\src\sota-research/`. Outcome = SOTA MCPs and repos installed in
Claude Code's runtime, plus a growing `patterns/` knowledge base distilled
from ingested repos. Executed by Claude Code (me) during normal CC sessions
using existing 14 MCPs + Codex GPT-5.5 xhigh + deepwiki/repomix + parallel
subagents. **No daemon. No MCP-server build. No Agent SDK headless. No cron.**

## Operating Principles (non-negotiable)

1. **Full-depth always.** Every passing candidate gets all 8 dimensions scored.
   No cheap-skips. No single-source declarations.
2. **Max parallel.** Discovery fans out across ≥6 MCPs concurrently. Stage-2
   scoring of N candidates runs as N subagent jobs with `isolation: worktree`.
   Codex per-candidate consensus runs *parallel to* stage-2, not after.
3. **Multi-angle convergence required.** Any score ≥80 requires ≥3 independent
   sources naming the candidate. Any INSTALL recommendation requires ≥4. Single
   sourced highs are demoted to STUDY/WATCH automatically.
4. **Continuous event-driven.** No cron, no scheduled batches. Discovery fires
   on explicit query, session-start delta-check, backlog SOTA-replaceable event,
   awesome-list delta, pattern-decay (≥90d), major-release event, or meta-research event.

## 1. Repo layout + 9 categories

```
C:\SEA\src\sota-research/
├── CLAUDE.md, README.md, package.json, biome.json, vitest.config.mjs, .gitignore, .nvmrc
├── docs/
│   ├── rubric.md                   # 8-dim score + stage-1 hard filter
│   ├── protocols/
│   │   ├── discovery.md            # multi-source convergent fan-out
│   │   ├── scoring.md              # stage-1 filter → stage-2 score
│   │   ├── codex-consensus.md      # per-candidate GPT-5.5 xhigh review
│   │   ├── ingestion.md            # L1/L2/L3 score-tiered
│   │   ├── decision.md             # score-continuous → action
│   │   ├── self-improvement.md     # event-driven outcome tracking
│   │   └── integration.md          # bridge to existing convergence-cycle + deep-audit-backlog
│   └── categories/                 # weights per category (sum to 1.0)
│       ├── mcp-server.md
│       ├── agent-framework.md
│       ├── agent-orchestration-pattern.md   # plan-by-files, GPT-5.5 OC, swarm
│       ├── research-agent.md       # gpt-researcher class
│       ├── skill-pack.md
│       ├── hook-toolkit.md
│       ├── awesome-list.md
│       ├── code-library.md
│       └── research-with-code.md
├── inventory/
│   ├── installed.md                # MCPs/plugins/repos in my runtime + versions + decisions
│   ├── watching.md                 # WATCH candidates + re-eval triggers
│   ├── rejected.md                 # REJECT with reasons (don't re-eval)
│   └── scan-<ts>.md                # per-scan output
├── watchlists/
│   ├── global.json                 # cross-project SOTA topics
│   └── schema.json                 # .sota-watch.json schema for consuming projects
├── patterns/<owner>/<repo>/        # local SOTA knowledge base
│   ├── meta.json                   # score, decision, source_count, evidence
│   ├── repomix.md                  # L1
│   ├── deepwiki.md                 # L2
│   └── sota-distill.md             # L3 (ADR-style)
├── reference/                      # cloned repos (symlink to ~/sota-repos/ permitted)
├── scripts/                        # ESM .mjs, named exports, biome-clean
│   ├── discover.mjs                # discover --topic <t> [--category <c>] → ranked candidates
│   ├── score.mjs                   # score <owner/repo> --category <c> → score + rationale
│   ├── ingest.mjs                  # ingest <owner/repo> --depth L1|L2|L3
│   ├── outcome.mjs                 # outcome review (30/60/90-day audit)
│   └── bootstrap.mjs               # first-run scan against starred + ecosystem topics
├── tests/                          # vitest, 80% coverage
├── .github/workflows/              # ci, codeql, release, dependency-review, sota-scan (workflow_dispatch)
└── .claude/skills/sota-research/   # skill loadable in any CC session
    ├── SKILL.md
    └── references/
```

**Categories (9, each with own profile doc):** MCP server, agent framework,
agent orchestration pattern (NEW — plan-by-files class), research agent
(gpt-researcher class), skill pack, hook toolkit, awesome-list, code library,
research-with-code.

## 2. 8-dimension rubric + stage-1 hard filter

### Stage-1 hard filter (6 gates — cheap, no API calls)

1. **License** — MIT/Apache-2.0/BSD-2/BSD-3/ISC/MPL-2.0 (LGPL/GPL only for code-library cat)
2. **Recency** — last commit ≤6mo OR last release ≤9mo (mature-utility exception: 2+yr stable with issue activity)
3. **Substance** — ≥30 lifetime commits OR ≥3 contributors OR ≥1 release
4. **Not archived / deprecated / read-only**
5. **Honeypot detection** — flag star spikes >50k/48h without commits; astroturfing patterns
6. **Category-fit pre-check** — has at least one marker matching claimed category (e.g., MCP needs `mcp.json` or stdio transport file)

### Stage-2: 8 dimensions (each 0-10)

| # | Dimension | Measures | Primary source |
|---|---|---|---|
| D1 | Stars (log10) | log10(stars+1) normalized 0-10. 100★→2.0, 1k→3.0, 10k→4.0, 100k→5.0 | GH API |
| D2 | Maintenance velocity | 90d commits + merged PRs, median issue response, contributor diversity | GH API |
| D3 | Claude Code runtime fit | MCP/skill/agent/hook/plugin artifacts; `claude-code` topic; mentions | gh search_code + repomix |
| D4 | Code quality | CI workflow, tests, coverage badge, linter, dependabot, README depth, types | GH tree + file contents |
| D5 | Ingestion friendliness | Size (1-50MB sweet spot), repomix token estimate, markdown/wiki presence | repomix --dry-run |
| D6 | Adoption signal | Fork-to-star ratio (~0.10-0.20 healthy), dependents, "used by", npm/pypi downloads | GH + registries |
| D7 | Conceptual novelty | New pattern vs reimplementation. Cross-ref `inventory/installed.md` + `patterns/` | local ctx_search |
| D8 | Community consensus | HN+Reddit+X mentions 90d, awesome-list cross-mentions, star velocity 30d | brave_news + jina qdr:m + tavily + firecrawl + exa |

### Sample weight profiles (excerpt — full set in `docs/categories/*.md`)

| Category | D1 stars | D2 maint | D3 CC-fit | D4 quality | D5 ingest | D6 adopt | D7 novel | D8 commun |
|---|---|---|---|---|---|---|---|---|
| MCP server | 0.05 | 0.20 | **0.30** | 0.15 | 0.05 | 0.10 | 0.10 | 0.05 |
| Agent framework | 0.05 | **0.25** | 0.15 | 0.10 | 0.10 | **0.20** | 0.05 | 0.10 |
| Agent orchestration pattern | 0.05 | 0.10 | 0.05 | 0.10 | **0.25** | 0.10 | **0.25** | 0.10 |
| Research agent | 0.05 | 0.15 | 0.10 | 0.10 | **0.20** | 0.10 | **0.20** | 0.10 |
| Skill pack | 0.05 | 0.15 | **0.30** | 0.10 | 0.05 | 0.20 | 0.05 | 0.10 |
| Hook toolkit | 0.05 | 0.15 | **0.30** | **0.20** | 0.05 | 0.10 | 0.10 | 0.05 |
| Awesome-list | 0.05 | **0.30** | 0.05 | 0.05 | 0.05 | 0.10 | 0.05 | **0.35** |
| Code library | 0.10 | 0.20 | 0.05 | **0.25** | 0.05 | **0.20** | 0.10 | 0.05 |
| Research-with-code | 0.05 | 0.10 | 0.05 | 0.15 | **0.20** | 0.10 | **0.25** | 0.10 |

### Score blending formula

```
rubric_score        = Σ (D_i * w_i_for_category) * 10           # 0-100
convergence_factor  = 0.80 + min(0.05 * source_count, 0.20)     # 0.80 (1 src) → 1.00 (4+ srcs)
codex_score         = codex_gpt55_xhigh_review_0_100            # independent verdict
final               = 0.6 * (rubric_score * convergence_factor) + 0.4 * codex_score
```

### Default thresholds (per-query override allowed)

| Range | Default action |
|---|---|
| ≥90 | INSTALL-FULL (with adversarial Codex pass) |
| 80-89 | INSTALL-LITE (skill/MCP/hook) OR STUDY (frameworks/libs) |
| 70-79 | STUDY (L1+L2 ingestion) |
| 60-69 | REFERENCE (clone to ~/sota-repos/, no distillation) |
| 40-59 | WATCH (re-eval in 90d OR on next major release) |
| <40 | REJECT (logged with reason) |

**Convergence-trust modulation:** single-source score caps at 80. `source_count<2` → demote one tier. `source_count≥5` → may promote one tier.

## 3. Discovery protocol (4-phase fan-out, multi-source convergent)

### Triggers (event-driven, no cron)

1. Explicit query — `/sota-research:find <topic>` or `node scripts/discover.mjs --topic <t>`
2. Session-start delta-check — when `.sota-watch.json` present, scan watched topics for additions since `last_seen`
3. Backlog SOTA-replaceable event — `deep-audit-backlog.md` adds replacement candidate
4. Awesome-list delta event — starred awesome-* README hash changed
5. Pattern-decay event — `patterns/<repo>/sota-distill.md` >90 days
6. Major-release event — starred repo publishes vN.0
7. Meta-research event — rubric weight drift or outcome-tracking signal

### Phase 1 — Parallel breadth (8 sources, `ctx_batch_execute concurrency=8`, ~30s)

| Source | Tool | Use |
|---|---|---|
| GitHub topic+keyword | mcp__github__search_repositories + gh CLI | `topic:<t> stars:>50 pushed:>2025-11-28` |
| GitHub GraphQL advanced | gh api graphql | Filter by contributors, dependents, marker files |
| Awesome-list crawl | mcp__firecrawl__firecrawl_scrape | punkpeye/awesome-mcp-servers, hesreallyhim/awesome-claude-code, ComposioHQ/awesome-claude-skills + user-starred awesome-* |
| Semantic web | mcp__exa__web_search_exa + deep_researcher_start | Concept-search, not keyword |
| Multi-step research | mcp__tavily__tavily_research (advanced) | Cross-source convergence |
| Fast triage | mcp__brave-search__brave_news_search + brave_web_search | Blog posts, last-90d |
| Recency web | mcp__jina__search_web (tbs=qdr:m) | Last-month deep |
| Academic | mcp__semantic-scholar__search_papers | Only for research-with-code |

Budget: ~$0.50-1.50, ~30s wall.

### Phase 2 — Convergence aggregation (in-process, no API)

```
For each candidate name in union(phase-1 results):
  canonical = resolve_canonical(candidate)  # follow redirects, find non-fork canonical
  source_count = |sources that named this canonical|
  source_list = which sources
Drop: source_count==1 AND preliminary_signal_score < threshold
```

### Phase 3 — Stage-1 hard filter (parallel GH metadata, concurrency=8, ~15s)

For each phase-2 survivor: parallel GH fetch of license, last-commit, last-release,
contributors, lifetime commits, archived flag, README first-5KB. Apply 6 hard-filter
gates. Typical yield: 20-30% pass.

### Phase 4 — Stage-2 score + parallel Codex consensus (~3-5 min for 10 candidates)

```
spawn parallel (concurrency=5 worktree subagents, model=sonnet):
  per candidate:
    gather D1..D8 dimension data from authoritative sources
    return rubric_score + dimension_evidence

simultaneously (parallel, NOT after):
  per candidate: codex exec --effort xhigh "<sota-research-codex-review>"
    input: repomix(repo, ≤50KB) + README + last-10-commits + top-3-issues
    return codex_score_0_100 + verdict + adversarial_flags

aggregate per candidate:
  final = 0.6 * (rubric_score * convergence_factor) + 0.4 * codex_score
  if |codex_score - rubric_score| > 25: auto-fire codex:codex-rescue adversarial pass
  decision_default = threshold_lookup(final, category, source_count)
```

### Phase 5 — Decision output

`inventory/scan-<timestamp>.md` with ranked recommendations + cost summary + audit trail.

### MCP-per-dimension routing

| Dim | Primary | Backup |
|---|---|---|
| D1 stars | mcp__github | gh CLI |
| D2 maintenance | mcp__github commits/PRs/issues | gh CLI |
| D3 CC fit | mcp__github search_code + README parse | filesystem on clone |
| D4 quality | mcp__github tree + file contents | filesystem |
| D5 ingestion | `npx repomix --dry-run` | filesystem size |
| D6 adoption | mcp__github + WebFetch on npm/pypi | gitnexus |
| D7 novelty | ctx_search local inventory + patterns | grep |
| D8 community | brave_news + jina qdr:m + firecrawl + exa | tavily research |

## 4. Codex per-candidate consensus protocol

### Prompt template (lives at `docs/protocols/codex-consensus.md`)

```
SYSTEM: You are GPT-5.5 reviewing a SOTA candidate for installation into a
Claude Code runtime. Be rigorous. Penalize hype. Reward genuine technique.

TASK: Evaluate <owner/repo> as <category> SOTA candidate against this rubric:
<8-dim definitions>
<category weight profile>

INPUTS:
- repomix(repo) [≤50KB flattened codebase]
- README.md
- Last 10 commits (titles + first line of message)
- Top 3 open issues + top 3 closed issues
- source_list (which discovery sources named it)
- cross-mention count

OUTPUT (strict JSON):
{
  "codex_score": 0-100,
  "verdict": "KEEP" | "REPLACE" | "EXPERIMENT" | "RETIRE" | "REJECT",
  "rationale": "<2-3 sentence summary>",
  "novel_techniques": ["..."],          // patterns worth distilling
  "anti_patterns": ["..."],             // what to NOT do
  "adversarial_flags": ["..."]          // hype, stale, bait-and-switch, etc
}
```

### Conflict resolution

When `|codex_score − rubric_score| > 25`, auto-fire `codex:codex-rescue` at
xhigh effort with the disagreement as input. Tiebreaker verdict recorded in
the scan output for auditability.

### Cost

~$0.30-0.80 per candidate at xhigh effort. Stage-2 batch of 10 candidates: ~$5-8.

## 5. Score-tiered ingestion + decision output

### L1 — All phase-3 passers (~$0.10/repo)

```
git clone https://github.com/<owner>/<repo> reference/<owner>/<repo>
cd reference/<owner>/<repo>
npx repomix --output ../../patterns/<owner>/<repo>/repomix.md --style markdown
write patterns/<owner>/<repo>/meta.json { score, decision, source_count, scanned_at }
```

### L2 — Score ≥80 (~$0.30/repo)

```
deepwiki_query(<owner>/<repo>, [
  "what is this project's architecture",
  "what are its novel techniques",
  "what does the typical user adopt",
  "what are common pitfalls"
])
write patterns/<owner>/<repo>/deepwiki.md
```

### L3 — Score ≥90 (~$1.50/repo)

```
codex exec --effort xhigh "<sota-distill prompt>"
  input: repomix.md + deepwiki.md + 5 highest-rated issues
  output: ADR-style document with sections:
    - Novel techniques (with line references to repomix)
    - Adoption targets (what to pull into our runtime)
    - Anti-patterns (what to avoid replicating)
    - Cross-repo refs (other repos this connects to)
write patterns/<owner>/<repo>/sota-distill.md
```

### Decision output: `inventory/scan-<ts>.md`

```markdown
# Discovery scan: <topic> @ <ISO-ts>
- Sources fired: 8 (skipped: <list>)
- Phase-1 candidates: N
- Phase-2 convergence: N
- Phase-3 hard-filter: N
- Phase-4 scored: N

## Recommendations (sorted by final score)
| Score | Action | Repo | Sources | Codex | Rationale |
|---|---|---|---|---|---|
| 91 | INSTALL-FULL | ... | 5 | 88 | ... |
| 84 | STUDY | ... | 4 | 80 | ... |
...

## Cost summary: $X.XX (phase 1) + $X.XX (phase 3) + $X.XX (phase 4) = $XX.XX
```

Side-effects:
- INSTALL-FULL → append to `inventory/installed.md` + queue install action
- INSTALL-LITE → append + queue artifact-pull
- STUDY → trigger L1+L2 ingestion
- REFERENCE → trigger L1 only
- WATCH → append to `inventory/watching.md` with re-eval triggers
- REJECT → append to `inventory/rejected.md` with reason

## 6. Self-improvement protocol (event-driven, no cron)

### Outcome tracking (continuous)

Every INSTALL/STUDY/REFERENCE decision logs to `inventory/decisions.jsonl`:
```json
{"ts": "...", "repo": "...", "action": "INSTALL-FULL", "score": 91, "category": "mcp-server", "convergence_sources": 5}
```

Outcome events fire re-eval:
- Package removed from project's package.json → was the INSTALL useful?
- Agent/skill file deleted → did the install land?
- `patterns/<repo>` unaccessed for 90 days → still relevant?
- New major release of an installed repo → re-validate against rubric

### Weight tuning from outcomes

Every 20 outcomes: compute "dim_i predictive accuracy" = correlation between
`dim_i_score` and `was_actually_useful_at_30/60/90_days`. Adjust category
weights ±5% per cycle. Cap at original_weight ± 30% drift.

### Meta-research trigger (the "research-the-researcher" event)

Fires when:
- 5+ outcomes show "high score but not actually useful" → rubric needs revision
- New category emerges (e.g., 3+ candidates in last 30d don't fit existing 9 categories)
- A new research MCP server is announced (e.g., Perplexity MCP releases)
- User-explicit: `node scripts/meta-research.mjs`

Meta-research = special convergence cycle scoped to the research architecture itself.
Uses existing `convergence-cycle-protocol.md` Phase 1-5 with topic =
"current SOTA for AI agent research/discovery architectures".

## 7. Integration with existing convergence-cycle + deep-audit-backlog

- **Discovery output** flows into `deep-audit-backlog.md` "Next planned convergence" section
- **Decision output ≥90** triggers existing `convergence-cycle-protocol.md` Phase 1 (2 researchers + Codex consensus)
- **`patterns/` corpus** is `ctx_search`-able by convergence-cycle researchers (Phase 1 Researcher A reads local patterns first)
- **`inventory/installed.md`** = source of truth for "what's deployed";
  supersedes/complements `sota-tools-installed.md` (which becomes a historical record)
- **`sota-recency-gate.md` rule** is encoded as stage-1 filter gate #2

## 8. Bootstrap plan (first run, this session)

Six parallel discovery scans (Wave 2):

1. **MCP servers SOTA 2026** — what should be in `~/.claude/mcp/` that isn't yet
2. **Agent orchestration patterns** — plan-by-files, GPT-5.5 advanced OC, swarm coordination, worktree-isolation, evaluator-optimizer
3. **Research agents** — gpt-researcher class (gpt-researcher, AnythingLLM if applicable, AutoGen-style researchers)
4. **Claude Code skill packs + hook toolkits** — beyond what's already starred/installed
5. **Code intelligence tools** — repomix-class, deepwiki-class, gitnexus competitors
6. **Audit user's 91 starred repos** — pattern-mine for high-signal repos with low stars

Named bootstrap targets (must be scored regardless of discovery yield):
- `assafelovic/gpt-researcher`
- `ComposioHQ/agent-orchestrator` (already in EXPERIMENT queue per sota-tools-installed.md)
- `HKUDS/OpenHarness`
- `multica-ai/multica`
- `safishamsi/graphify`
- `anthropics/knowledge-work-plugins`
- `addyosmani/agent-skills`, `vercel-labs/agent-skills`, `ComposioHQ/awesome-claude-skills`
- `K-Dense-AI/scientific-agent-skills`, `Imbad0202/academic-research-skills`
- `punkpeye/awesome-mcp-servers` (as both candidate AND ingestion source)
- `multica-ai/andrej-karpathy-skills`
- `quemsah/awesome-claude-plugins`
- `Shubhamsaboo/awesome-llm-apps`

Output: `inventory/bootstrap-2026-05-28.md` with all stage-2 survivors ranked.

## 9. GitHub workflows (event-driven, no cron)

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | push, PR | biome lint + vitest (80% coverage) |
| `codeql.yml` | PR, push to main | security scanning |
| `dependency-review.yml` | PR | block PRs introducing vuln deps |
| `release.yml` | tag `v*.*.*` | npm publish (if applicable) + GH Release |
| `sota-scan.yml` | workflow_dispatch only (manual) | runs bootstrap.mjs in CI, opens PR with scan output. **NO `schedule:` block.** |
| `dependabot.yml` | weekly (dependabot is the one exception — it's security-bound, not cron-as-feature) | deps + GH Actions security updates |

## 10. Testing strategy

- vitest with 80% coverage threshold (matches vein-launch convention)
- Mock GH API + exa + tavily for unit tests; record/replay fixtures for integration
- Integration test: dry-run discovery against a fixture repo set with known scores
- Property test: stage-1 filter never lets through an archived repo

## Code conventions

- ESM only (`type: "module"`, `.mjs` extensions)
- Biome 2.x for lint + format
- Named exports only (no default exports)
- Errors: throw with context, never silently swallow
- Match vein-launch CLAUDE.md conventions (consistency across SEA/src)

## Build order (for execution this session)

**Wave 1 — Repo scaffold (5 parallel sonnet subagents):**
- A: Repo skeleton + config + .github workflows + .claude/skills SKILL.md
- B: docs/rubric.md + docs/categories/*.md (10 files)
- C: docs/protocols/*.md (7 files)
- D: scripts/*.mjs (5 files) + tests setup
- E: inventory templates + watchlists/schema.json + README

**Wave 2 — Bootstrap discovery (3 parallel sonnet researcher subagents):**
- F: Topic — MCP servers SOTA 2026 (multi-MCP fan-out, named targets scored)
- G: Topic — agent orchestration patterns + plan-by-files + GPT-5.5 OC + research-agent class
- H: Audit — user's 91 starred repos + Claude Code skill/hook ecosystem

**Wave 3 — Codex consensus on the spec + scaffolded repo (sequential after waves 1-2):**
- codex:codex-rescue at xhigh effort reviews:
  (a) protocol contradictions
  (b) missing edge cases in rubric
  (c) script correctness
  (d) GitHub workflow security posture

**Wave 4 — Stage-2 score on top candidates + final recommendations:**
- 8-dim rubric scoring (parallel)
- Codex per-candidate review (parallel to rubric)
- Produce `inventory/bootstrap-2026-05-28.md`

## Cost estimate

| Wave | Component | Est cost |
|---|---|---|
| 1 | 5 sonnet build subagents | $3-6 |
| 2 | 3 sonnet research subagents w/ MCP calls | $5-12 |
| 3 | Codex xhigh repo review | $2-5 |
| 4 | Stage-2 + Codex per-candidate (10-20 candidates) | $10-25 |
| **Total** | **First-run execution** | **$20-50** |

Steady-state weekly (after bootstrap, with watch + delta scans): ~$10-20/week.

## Out of scope

- No daemon process (no PM2 entry for sota-research)
- No MCP server build (no stdio server, no HTTP server)
- No Agent SDK headless harness
- No cron / scheduled batches (event-driven only — dependabot is the lone exception)
- No new model integrations beyond Claude (main) + Codex GPT-5.5 (consensus + distillation)

---

## Appendix A — SOTA practice research findings (2026-05-28, 5-source convergence)

Converged from tavily-advanced + exa + brave + jina + tavily. All findings load-bearing
for the protocols below.

### A.1 GitHub GraphQL-first for all repo metadata

**Source:** GitHub docs, OneUptime blog (Jan 2026), arxiv 2508.13453.

- Point system: GraphQL without mutations = 1 pt; REST GET = 1 pt. **A single GraphQL
  query can fetch dozens of nested fields per point** — N-way more efficient than REST
  for repo metadata.
- Cursor-based pagination required (not offset). Use `after` argument with `cursor`.
- ETag / conditional requests for cache-aware re-scans.
- **Implication for Section 3 Phase 3:** rewrite hard-filter to use ONE GraphQL query per
  ~10 candidates fetching `license + defaultBranchRef.target.history(first:100) +
  releases(first:1) + collaborators(first:5) + isArchived + repositoryTopics +
  object(expression:"HEAD:README.md")` in a single batch call. ~5-10× cost reduction.

### A.2 OpenSSF Scorecard as D4 sub-signal (50% of D4 weight)

**Source:** rywalker.com/research/developer-trust-tools (Mar 2026), opensauced.pizza, openssf.org.

- 18+ automated security checks ("credit score for open source"). Standard reference.
- Caveat (Andrew Nesbitt, May 2026 "Mismeasure of Open Source"): some checks measure GitHub
  features not security properties; Goodhart-prone. Use as ONE signal, never the whole answer.
- **Implication for Section 2 D4:** D4 = 0.5 × OpenSSF Scorecard score + 0.5 × our own
  signals (CI/tests/dependabot/types/README depth). Query via `gh api /repos/.../scorecard`
  or directly from `api.scorecard.dev`.

### A.3 Behavioral + process security combined (getcommit.dev / Pii)

**Source:** dev.to/piiiico (May 2026) — `getcommit.dev` integration with Scorecard.

- axios scored 8.0 Scorecard but was still compromised March 30 2026 (stolen npm credentials).
  Process-security score alone is insufficient.
- Behavioral signals (single-publisher concentration + high downloads) identify supply-chain
  risk that Scorecard misses.
- **Implication for Section 2:** add "publisher concentration risk" to D6 (adoption) for
  npm/pypi-distributed candidates: `single_publisher × log10(weekly_downloads)` flag.

### A.4 DeepWiki MCP — adopt immediately

**Source:** codersera.com/deepwiki-complete-guide-2026, Cognition Labs.

- Official MCP server at `mcp.deepwiki.com` — free for public repos, 50,000+ repos indexed,
  4B+ lines processed.
- Replaces the deepwiki HTTP scrape we planned for L2 ingestion.
- **Implication for Section 5 L2:** L2 path becomes `mcp__deepwiki__query(repo, questions)`
  → `patterns/<repo>/deepwiki.md`. Add `claude mcp add deepwiki` to bootstrap install list.

### A.5 Code intelligence landscape (Ry Walker taxonomy 2026)

**Source:** rywalker.com/research/code-intelligence-tools.

| Tier | Tools | When to use |
|---|---|---|
| Knowledge graph | GitNexus (25k★, already an MCP), CodeGraphContext (2.2k★) | Large repos >10k files with complex deps |
| MCP code search | Octocode, CodePathFinder | Symbol-level navigation |
| Context packing | **Repomix (22k★)**, code2prompt (7.2k★) | Small repos <10k files |
| Platform | Sourcegraph Cody, DeepWiki, Greptile | Enterprise / cross-repo collab |

- **Implication for Section 5 ingestion:**
  - L1 always: `npx repomix`
  - L1.5 (NEW, if repo has >10k files OR complex deps): also run GitNexus indexing
  - L2: DeepWiki MCP
  - L3: Codex distillation reading L1+L1.5+L2

### A.6 Deep research agent market map (canonical 2026-Q2)

**Source:** rywalker.com/research/autoresearch-tools, ARUNAGIRINATHAN-K/awesome-ai-agents-2026.

| Tool | Stars | Pattern | Note |
|---|---|---|---|
| `assafelovic/gpt-researcher` | 26.4k | Planner/execution + verify | OG, 20+ sources per report |
| `dzhng/deep-research` | 18.7k | Simplest impl, depth/breadth ctrl | Under 500 LoC |
| Tongyi DeepResearch | 18.6k | RL-trained Qwen3-30B-A3B | SOTA benchmarks |
| `langchain-ai/open_deep_research` | 11k | LangGraph + MCP | Multi-provider, no-code UI |
| open-deep-research (Firecrawl) | 6.2k | Firecrawl-powered | Simple clone |
| DeepResearchAgent | 3.3k | Self-evolving (Autogenesis) | Cutting-edge pattern |
| ByteDance DeerFlow | TBD | Multi-agent planning/execution | Recent |

Two diverging schools: **depth/breadth control** (dzhng) vs **planner-execute-verify**
(gpt-researcher) vs **self-evolving multi-agent** (DeepResearchAgent).

**The "clianything" the user mentioned** likely resolves to either `Mintplex-Labs/anything-llm`
or `cline/cline` (formerly Claude Dev) — bootstrap will canonicalize.

- **Implication for Section 8 bootstrap:** all six MUST be scored; the dzhng minimal-impl
  pattern + DeepResearchAgent self-evolving pattern are top novelty signals.

### A.7 Agent orchestration patterns (5 canonical 2026)

**Source:** jina/Medium (Vinod Rane), Brave (Stack Overflow / system-design-one), Apr-May 2026.

1. **ReAct** (Reason+Act) — alternating think/tool-use cycles
2. **Agentic RAG** — agent decides what/how/when to retrieve
3. **Multi-Agent Workflow / Handoffs** — specialized agents (OpenAI Swarm reference impl)
4. **Plan-by-files** — agent writes plan into separate files for coordination (user-emphasized)
5. **Evaluator-Optimizer** — generator + evaluator loop (already used in our Codex consensus)

Concrete repos:
- `ComposioHQ/agent-orchestrator` — parallel coding agents w/ handoffs (already EXPERIMENT-queued)
- `openai/swarm` — handoffs + routines (reference)
- `ruvnet/ruflo` — swarm coordination + consensus + self-learning (already installed)
- `EvoMap/awesome-agent-swarm` — curated catalog (NEW discovery target)

- **Implication for Section 1:** `agent-orchestration-pattern` category should have
  sub-type tags `{react, agentic-rag, handoff, plan-by-files, evaluator-optimizer}`
  so candidates self-classify in scoring.

### A.8 Megalodon supply-chain risk (May 2026)

**Source:** safedep.io/megalodon-mass-github-repo-backdooring-ci-workflows.

- Mass automated backdooring via dangerous CI workflows. 400+ repos confirmed compromised
  by bot-author pattern injecting workflows.
- **Implication for Section 2 stage-1 honeypot gate:** add bot-author detection
  (`commits.author.email matches /(build-bot|ci-bot|auto-ci|pipeline-bot|@cdn-cgi)/`)
  as immediate REJECT.

### A.9 Mismeasure-of-OSS caution (Andrew Nesbitt, May 2026)

**Source:** nesbitt.io/2026/05/09/the-mismeasure-of-open-source.html.

- **Filter quality > formula quality.** The candidate set the model runs over has
  usually made the bigger decision already.
- Avoid GitHub-only signals — critical infra often lives on cgit, mailing lists, sourcehut.
- Goodhart on Scorecard — enabling checkboxes ≠ doing the security work.
- **Implication:** our convergence-trust rule (Section 2, single-source caps at 80) is
  exactly the right hedge. KEEP. Also: add `source_diversity_index` (Shannon entropy
  across discovery sources) as audit metric in scan output.

### A.10 Karpathy autoresearch / experiment-loop

**Source:** rywalker.com autoresearch report, May 2026.

- Karpathy's nanochat exhibits "experiment loop" pattern: agent runs experiments,
  measures metrics, picks best, iterates. Predicted: by Q3 2026, every major coding agent
  will have native experiment loop support.
- **Implication for Section 6 self-improvement:** outcome tracking IS our experiment loop.
  Track "did INSTALL actually compound?" as the metric, tune rubric weights from it.

---

## Appendix B — Concrete GraphQL query templates (referenced by `scripts/discover.mjs`)

### B.1 Stage-1 hard-filter batch query (10 candidates per 1 point)

```graphql
query HardFilter($q1: ID!, $q2: ID!, ...) {
  q1: node(id: $q1) { ... on Repository { ...HardFilterFields } }
  q2: node(id: $q2) { ... on Repository { ...HardFilterFields } }
  ...
}
fragment HardFilterFields on Repository {
  nameWithOwner
  isArchived
  isDisabled
  isMirror
  licenseInfo { spdxId }
  defaultBranchRef { target { ... on Commit { history(first:1) { totalCount } committedDate } } }
  pushedAt
  releases(first:1, orderBy:{field:CREATED_AT, direction:DESC}) { nodes { createdAt } }
  collaborators(first:1) { totalCount }
  object(expression:"HEAD:README.md") { ... on Blob { byteSize } }
  repositoryTopics(first:20) { nodes { topic { name } } }
}
```

### B.2 Stage-2 dimension query (per-candidate, 1 point each)

```graphql
query Dim($owner: String!, $name: String!) {
  repository(owner:$owner, name:$name) {
    stargazerCount
    forkCount
    watchers { totalCount }
    issues(states:OPEN, first:1) { totalCount }
    closedIssues: issues(states:CLOSED, first:1) { totalCount }
    pullRequests(states:MERGED, first:10, orderBy:{field:UPDATED_AT, direction:DESC}) {
      totalCount
      nodes { mergedAt }
    }
    defaultBranchRef { target { ... on Commit {
      history(first:30) { totalCount nodes { author { user { login } email } committedDate } }
    } } }
    languages(first:5, orderBy:{field:SIZE, direction:DESC}) { edges { size node { name } } }
    repositoryTopics(first:30) { nodes { topic { name } } }
    object(expression:"HEAD:") { ... on Tree { entries { name type } } }
    mentionableUsers(first:1) { totalCount }
  }
}
```

### B.3 Search-by-topic (Phase 1 source #1)

```graphql
query Search($q: String!, $cursor: String) {
  search(query:$q, type:REPOSITORY, first:25, after:$cursor) {
    repositoryCount
    pageInfo { hasNextPage endCursor }
    nodes { ... on Repository {
      nameWithOwner stargazerCount pushedAt licenseInfo { spdxId }
      repositoryTopics(first:5) { nodes { topic { name } } }
      description
    } }
  }
}
```

`$q` example: `topic:mcp-server stars:>50 pushed:>2025-11-28 archived:false`

### B.4 Rate-limit awareness

```graphql
query { rateLimit { remaining resetAt cost nodeCount } }
```

Run this before every batch; pause if `remaining < (cost * 5)`.

---

## Appendix C — Updated MCP install list (bootstrap action)

Add to my runtime (`claude mcp add ...`):
- `deepwiki` (mcp.deepwiki.com) — for L2 ingestion (NEW per A.4)
- `octocode` or `codepathfinder` — symbol-level code search (NEW per A.5, EXPERIMENT-tier)
- `repomix-mcp` (if exists) — programmatic repomix invocation (verify in bootstrap)
- `code-graph-context` — alternative knowledge graph (EXPERIMENT-tier vs gitnexus)

Already installed (no action): gitnexus, github, exa, tavily, brave-search, jina,
firecrawl, semantic-scholar, context7, sequential-thinking, filesystem, memory,
playwright, plugin-context-mode.

---

## Appendix D — Convergence-fact-check on user's stated targets

| User-named | Canonical | Stars | Category | Bootstrap action |
|---|---|---|---|---|
| gpt-researcher | `assafelovic/gpt-researcher` | 26.4k | research-agent | Score in bootstrap |
| clianything | likely `Mintplex-Labs/anything-llm` OR `cline/cline` (verify) | TBD | research-agent OR agent-framework | Canonicalize then score |
| plan-by-files | (pattern, not a single repo) | — | agent-orchestration-pattern | Pattern discovery across multiple repos |
| GPT-5.5 advanced OC | `openai/codex` + Codex docs | — | agent-framework + pattern | Distill from codex CLI repo |

