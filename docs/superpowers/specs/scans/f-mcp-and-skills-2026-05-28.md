# Discovery Scan: SOTA MCP Servers & Claude Code Skill Packs (2026-05-28)

## Scan Metadata

- **Topic:** MCP servers + Claude Code skill packs + hook toolkits (SOTA landscape Q2 2026)
- **Execution date:** 2026-05-28
- **Phase-1 sources fired:** 7 (GitHub API search ×3, firecrawl awesome-list, exa semantic, tavily advanced, brave news)
- **Raw candidates collected:** 62
- **After Phase-2 deduplication:** 62 canonical entries
- **Stage-1 filter applied:** None yet (all candidates retained for initial triage)
- **Estimated cost:** $0.50–1.50 (MCP calls only; no GH GraphQL batch yet)

---

## Summary

### By Category

| Category | Count | Key signals |
|---|---|---|
| **MCP Server** | 33 | context7 (56k★, 3-src), ruflo (55k★), Scrapling (54k★), gpt-researcher (27k★, research-agent class) |
| **Claude Code Skill Pack** | 23 | frontend-slides (19k★), Obsidian 2-brain (1.4k★), blog systems, design skills |
| **Code Library** | 3 | mcp-use (10k★, fullstack MCP framework), microsoft/mcp-for-beginners (16k★ curriculum), repomix (22k★) |
| **Plugin/Hook Toolkit** | 1 | context-mode (15k★, context window optimization) |
| **Research Agent** | 2 | gpt-researcher (27k★, multi-source mentioned in spec bootstrap targets) |

### High-Confidence Multi-Source Findings

**3+ sources naming the same candidate (convergence trust ≥0.90):**
- **upstash/context7** — 56k★, TypeScript, **3 sources** (GitHub, exa, tavily). "Up-to-date code docs for LLMs. Prevents API hallucinations."
  - **Verdict:** HIGH-PRIORITY. INSTALL-LITE candidate. Already known to user; confirms SOTA stability.

**2+ sources:**
- **assafelovic/gpt-researcher** — 27k★, Python, **2 sources** (GitHub, spec bootstrap). Research agent with 20+ source reports.
  - **Verdict:** HIGH-PRIORITY. STUDY candidate. Named in spec as explicit bootstrap target.
- **Figma MCP, Playwright MCP, Supabase MCP, PostgreSQL MCP, Parallel Search MCP** — each **2 sources** (exa + tavily) with no GitHub star data yet.
  - **Verdict:** REFERENCE. Likely official (Figma, Supabase, Postgres) or high-quality community. Stage-1 filter will verify.

---

## Detailed Candidate Rankings

### MCP Servers (33 candidates)

Sorted by stars (descending) with source count and category fit:

| Rank | Name | Owner | Stars | Lang | Sources | D3 (CC-fit signal) | Stage-1 Verdict |
|---|---|---|---|---|---|---|---|
| 1 | n8n | n8n-io | 190k | TS | 1 | "mcp-server" topic tag | REFERENCE (automation platform, edge-case MCP use) |
| 2 | gemini-cli | google-gemini | 104k | TS | 1 | "ai-agents, mcp-client, mcp-server" topics | REFERENCE (Gemini CLI, not Claude-primary) |
| 3 | TrendRadar | sansan0 | 58k | Py | 1 | "mcp-server" tag, trend monitoring | REFERENCE (surveillance-class, niche) |
| 4 | context7 | upstash | 56k | TS | 3 | Official Upstash, prevents hallucinations, live docs | **INSTALL-LITE (already user-known)** |
| 5 | ruflo | ruvnet | 55k | TS | 1 | Agent orchestration, swarm, MCP server | STUDY (swarm coordination; already installed per user) |
| 6 | Scrapling | D4Vinci | 54k | Py | 1 | Web scraping + MCP | REFERENCE (web content extraction; overlap with firecrawl) |
| 7 | chrome-devtools-mcp | ChromeDevTools | 42k | TS | 1 | Browser debugging for agents | STUDY (browser control; Playwright MCP alternative) |
| 8 | UI-TARS-desktop | bytedance | 35k | TS | 1 | Multimodal GUI agent + vision | STUDY (GUI automation; ByteDance production) |
| 9 | github-mcp-server | github | 30k | Go | 1 | Official GitHub MCP | **INSTALL-LITE (already user-known)** |
| 10 | serena | oraios | 24k | Py | 1 | Semantic IDE for agents, Claude Code fit | STUDY (semantic retrieval + editing; CompilerLike tool) |
| 11 | activepieces | activepieces | 22k | TS | 1 | 400+ MCP servers catalog + workflows | REFERENCE (meta-platform; overlaps with n8n-mcp) |
| 12 | n8n-mcp | czlonkowski | 21k | TS | 1 | n8n workflow builder MCP for Claude | STUDY (workflow automation; single-point integration) |
| 13 | MaxKB | 1Panel-dev | 21k | Py | 1 | Enterprise agent platform + MCP | REFERENCE (knowledge base + agent; RAG-class) |
| 14 | FunASR | modelscope | 16k | Py | 1 | Speech recognition + MCP server | REFERENCE (audio; outside primary scope) |
| 15 | mcp-for-beginners | microsoft | 16k | NB | 1 | MCP curriculum (code library, not server) | REFERENCE → re-categorize |
| 16 | context-mode | mksglu | 15k | TS | 1 | Context window optimization plugin | **INSTALL-LITE (already user-known, Appendix C confirmed)** |
| 17 | trigger.dev | triggerdotdev | 15k | TS | 1 | Managed AI agents + workflows + MCP | STUDY (agentic orchestration; Workflow class) |
| 18 | OpenMetadata | open-metadata | 14k | TS | 1 | Metadata platform + MCP | REFERENCE (data governance; niche) |
| 19 | xiaohongshu-mcp | xpzouying | 13k | Go | 1 | Platform scraping (region-specific) | REFERENCE (geo-specific; low signal for US user) |
| 20 | Skill_Seekers | yusufkaraaslan | 13k | Py | 1 | Auto-convert docs→Claude skills + MCP | STUDY (skill-pack generator; meta-useful) |
| 21+ | (16 more) | … | <13k | … | 1 | (niche: XHS, nginx-ui, ARIS, AWS MCP, hexstrike, ida-pro) | REFERENCE or WATCH |

**Not in GitHub search (sourced from exa/tavily/spec):**

| Name | Stars | Lang | Sources | Signal | Stage-1 Verdict |
|---|---|---|---|---|---|
| **Figma MCP** | ? | ? | exa, tavily | Official Figma; design-to-code | REFERENCE (lookup canonical repo) |
| **Playwright MCP** | ? | ? | exa, tavily | Official Playwright; browser automation | STUDY (already known pattern; verify official MCP) |
| **Supabase MCP** | ? | ? | exa, tavily | Official Supabase; database + auth | STUDY (database integration; Postgres alternative) |
| **PostgreSQL MCP** | ? | ? | exa, tavily | Official Postgres; read-only DB access | STUDY (database integration) |
| **Parallel Search MCP** | ? | ? | exa, tavily | Free web search for agents | REFERENCE (web search; overlap with exa/jina/tavily) |
| **Composio** | ? | ? | exa, tavily | Composio integration hub (100+ tools) | REFERENCE (meta-platform; may be suite of MCPs) |
| **DeepWiki MCP** | ? | ? | spec-A.4 | mcp.deepwiki.com; L2 ingestion | **INSTALL-FULL (per spec A.4 SOTA finding)** |
| **Octocode MCP** | ? | ? | spec-A.5 | Code intelligence / symbol navigation | REFERENCE (lookup canonical) |
| **CodePathFinder MCP** | ? | ? | spec-A.5 | Code path tracing / symbol navigation | REFERENCE (lookup canonical) |
| **code-graph-context** | 2.2k | ? | spec-A.5 | Knowledge graph (CodeGraphContext) | STUDY (alternative to gitnexus; verify canonical) |

---

### Claude Code Skill Packs (23 candidates)

| Rank | Name | Owner | Stars | Lang | Key domains | Stage-1 Verdict |
|---|---|---|---|---|---|---|
| 1 | frontend-slides | zarazhangrui | 19k | JS | Slide generation from prompts | STUDY (vibe-coding UI; visual output) |
| 2 | obsidian-second-brain | eugeniughelbur | 1.4k | Py | Vault-first research + agents | STUDY (knowledge management; cross-CLI) |
| 3 | pm-claude-skills | mohitagw15856 | 905 | Sh | 135 professional skills (PM-focused) | REFERENCE (domain-specific; bulk collection) |
| 4 | claude-blog | AgriciDaniel | 867 | Py | 30 blog publishing skills | REFERENCE (content creation; single-domain) |
| 5 | gpt-image2-ppt-skills | JuneYaooo | 761 | Py | PPT template cloning (GPT-image-2) | REFERENCE (design template; external API) |
| 6 | hue | dominikmartn | 655 | HTML | Brand design system skill | REFERENCE (design; single-purpose) |
| 7 | Agentic-SEO-Skill | Bhanunamikaze | 584 | Py | 16 SEO sub-skills + 88 utilities | REFERENCE (domain-specific; bulk) |
| 8 | storybloq | Storybloq | 556 | TS | Cross-session context + story skill + MCP | STUDY (session continuity; novel pattern) |
| 9 | archify | tt-a1i | 537 | HTML | Architecture diagram skill | REFERENCE (single-purpose; niche) |
| 10+ | (13 more) | … | <500 | … | (design, music, legal, sports, etc.) | REFERENCE or WATCH |

---

### Code Libraries (3 candidates)

| Name | Stars | Lang | Purpose | Stage-1 Verdict |
|---|---|---|---|---|
| mcp-use | 10k | TS | Fullstack MCP framework + SDK | STUDY (MCP dev tooling; meta-useful) |
| microsoft/mcp-for-beginners | 16k | NB | MCP curriculum + examples | REFERENCE (educational; not runtime) |
| repomix | 22k | ? | Context packing tool (≤10k files) | STUDY (spec-A.5 confirmed; L1 ingestion) |

---

## Verifications Required (Appendix A.4-A.7 targets)

### MUST-VERIFY in Stage-1

1. **DeepWiki MCP** — spec says "mcp.deepwiki.com" official MCP
   - Expected: Canonical repo + install command
   - Status: Need GH repo lookup (not in Phase-1 search results)
   - Action: `gh search repos "deepwiki mcp"` or direct GitHub browse

2. **Octocode MCP** — symbol-level code search
   - Expected: Canonical GitHub repo
   - Status: Not in Phase-1; needs manual verification
   - Action: Web search + GitHub verify

3. **CodePathFinder MCP** — code path tracing / symbol navigation
   - Expected: Canonical GitHub repo
   - Status: Not in Phase-1; needs manual verification
   - Action: Web search + GitHub verify

4. **code-graph-context** — knowledge graph alternative to gitnexus
   - Expected: GitHub repo `CodeGraphContext` or similar owner
   - Status: Referenced in spec as "2.2k★"; likely exists but not in search results
   - Action: GH API direct lookup or web search "CodeGraphContext GitHub"

5. **repomix** — context packing tool (22k stars claimed)
   - Expected: GitHub repo with install command
   - Status: Not in Phase-1 search results despite high stars
   - Action: GH search `repomix` or check npm registry

6. **punkpeye/awesome-mcp-servers** — awesome-list source itself
   - Status: Listed in firecrawl target but content too large
   - Action: Fetch README + compute last-3-month addition delta

### Canonical Resolution Table

| Target (from spec) | Resolved name | Canonical owner | Stars | Install method | Action |
|---|---|---|---|---|---|
| DeepWiki MCP | ? | ? | ? | MCP server @ mcp.deepwiki.com | VERIFY |
| Octocode | ? | ? | ? | MCP server | VERIFY |
| CodePathFinder | ? | ? | ? | MCP server | VERIFY |
| code-graph-context | code-graph-context | ? | 2.2k | MCP server | VERIFY |
| repomix | repomix | ? | 22k | npm CLI + optional MCP | VERIFY |
| gpt-researcher | assafelovic/gpt-researcher | assafelovic | 27k | npm + MCP | CONFIRMED (27k stars, multi-source) |
| awesome-mcp-servers | punkpeye/awesome-mcp-servers | punkpeye | ? | README (git source) | VERIFY (count additions) |

---

## Top 5 Per Category for Stage-2 Scoring

### Stage-2 scoring will focus on: D1 stars, D2 maintenance velocity, D3 Claude Code fit, D4 code quality, D5 ingestion friendliness, D6 adoption, D7 novelty, D8 community consensus.

**MCP Servers (priority order for scoring):**
1. **upstash/context7** — 56k★, 3-source convergence, live docs (prevents hallucinations)
2. **assafelovic/gpt-researcher** — 27k★, research agent class, multi-source
3. **ruvnet/ruflo** — 55k★, agent orchestration + swarm (already installed; verify novelty)
4. **oraios/serena** — 24k★, semantic IDE for agents (novel approach)
5. **chrome-devtools-mcp** — 42k★, browser debugging (Playwright alternative)

**Claude Code Skill Packs (priority order):**
1. **zarazhangrui/frontend-slides** — 19k★, vibe-coding UI (visual output)
2. **eugeniughelbur/obsidian-second-brain** — 1.4k★, cross-CLI + vault-first (novel architecture)
3. **Storybloq/storybloq** — 556★, session continuity + story tracking (plan-by-files adjacent)
4. **yusufkaraaslan/Skill_Seekers** — 13k★, auto-generate skills from docs (meta-useful)
5. **alirezarezvani/ClaudeForge** — 372★, CLAUDE.md generation (CLAUDE.md management)

**Code Libraries (priority order):**
1. **mcp-use** — 10k★, fullstack MCP framework
2. **repomix** — 22k★, context packing (L1 ingestion per spec)
3. **microsoft/mcp-for-beginners** — 16k★, curriculum (educational value)

**Verification-First (must canonicalize before scoring):**
- DeepWiki MCP (spec-critical: L2 ingestion replacement)
- code-graph-context (2.2k★, alternative to gitnexus)
- Octocode + CodePathFinder (code intelligence tier)

---

## Cost Summary

| Phase | Component | Calls | Est. Cost |
|---|---|---|---|
| Phase 1 | GitHub search ×3 + exa + tavily + brave news + firecrawl | 7 | $0.50–1.50 |
| Phase 2 | Deduplication + sorting (in-process, no API) | — | $0.00 |
| Phase 3 | Stage-1 hard-filter (GH GraphQL batch ×8 candidates) | ~1 batch | $0.10–0.20 |
| Phase 4 | Stage-2 scoring (rubric + Codex xhigh ×15–20 candidates) | — | $8–15 (parallel) |
| **Total** | **First-wave bootstrap** | | **~$10–20** |

---

## Notes for Stage-2 & Phase-3

1. **Context7, GitHub MCP, Ruflo, context-mode** are already user-installed. Stage-2 should focus on:
   - Novelty differential (why score them again if installed?)
   - Maintenance velocity post-install (are they active?)
   - Adoption/usage patterns in the wild (are they living up to hype?)

2. **DeepWiki MCP** is spec-critical per Appendix A.4. **Must verify before Stage-2** to confirm:
   - Canonical GitHub repo exists
   - Install command matches "mcp.deepwiki.com" statement
   - Cost: L2 ingestion replacement (was $0.30/repo via HTTP call; check if MCP is cheaper)

3. **gpt-researcher** is spec bootstrap target + 2-source convergence. Priority scorer.

4. **Awesome-list crawl (punkpeye/awesome-mcp-servers)** returned 637KB of markdown. Need to:
   - Extract entry count
   - Compute delta since 2026-05-01 (last-3-month additions)
   - De-duplicate against Phase-1 results

5. **Figma, Playwright, Supabase, PostgreSQL, Parallel Search** are named by exa + tavily but not GitHub search.
   - Likely official servers (Figma, Supabase, Postgres are vendors)
   - Need canonical repo lookup before Stage-1 filter
   - Action: `gh search repos "figma mcp"` etc.

---

## Session Metadata

- **Generated by:** Claude Code (Haiku 4.5)
- **Session:** Phase-1 multi-source discovery (Wave 2 bootstrap)
- **Next:** Phase-3 hard-filter + Stage-1 gate (verify licenses, recency, substance)
- **Then:** Phase-4 + Codex consensus on top 15–20 candidates
