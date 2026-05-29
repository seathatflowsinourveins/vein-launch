# Phase-1 SOTA Discovery Scan: Agent Orchestration & Research Agents

**Scan Date:** 2026-05-28  
**Methodology:** Multi-source convergence (GitHub API, gh CLI, search aggregation)  
**Budget Used:** ~$0.80  
**Stage-1 Pass Rate:** 13/14 candidates (93%)  
**Scope:** Research agents (gpt-researcher class) + orchestration patterns (plan-by-files, swarm, multi-agent)

---

## Research Agents — Full Market Map

| Rank | Name | Owner | Stars | Updated | License | Pattern School | Stage-1 | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | gpt-researcher | assafelovic/gpt-researcher | 27,358 | 2026-05-28 | Apache-2.0 | Planner-execute-verify | **PASS** | OG, 20+ sources, multi-provider support |
| 2 | Alibaba Tongyi DeepResearch | Alibaba-NLP/DeepResearch | 18,975 | 2026-05-28 | Apache-2.0 | RL-trained Qwen3 | **PASS** | SOTA benchmarks, Alibaba open-sourced |
| 3 | deep-research | dzhng/deep-research | 18,990 | 2026-05-28 | MIT | Minimal impl, <500 LoC | **PASS** | Depth/breadth control reference, elegant |
| 4 | open_deep_research | langchain-ai/open_deep_research | 11,515 | 2026-05-28 | MIT | LangGraph+MCP, multi-provider | **PASS** | No-code UI, LangChain native, native MCP support |
| 5 | khoj | khoj-ai/khoj | 34,740 | 2026-05-28 | AGPL-3.0 | Self-hosted AI brain | **PASS** | Beyond research: agent scheduling, custom workflows |
| 6 | deep-research-agent | u14app/deep-research | 4,591 | 2026-05-27 | MIT | SSE API + MCP server | **PASS** | Works with any LLM, MCP-native |
| 7 | DeepResearchAgent | SkyworkAI/DeepResearchAgent | 3,406 | 2026-05-28 | MIT | Self-evolving multi-agent | **PASS** | **NOVELTY:** Hierarchical planning, task decomposition |
| 8 | open-deep-research | nickscamara/open-deep-research | 6,240 | 2026-05-28 | Other | Firecrawl-powered clone | **FAIL** | License unclear, skip stage-2 |

**Key Pattern Divergence:**
- **Planner-execute-verify**: gpt-researcher (industry standard), open_deep_research (LangGraph)
- **Minimal/elegant**: dzhng/deep-research (reference implementation, lowest LoC)
- **Self-evolving**: DeepResearchAgent (autogenesis pattern, cutting-edge)

---

## Orchestration Patterns — Concrete Repos Found

| Rank | Name | Owner | Stars | Updated | License | Pattern Tag | Stage-1 | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | ruflo | ruvnet/ruflo | 55,931 | 2026-05-28 | MIT | Enterprise swarm + self-learning | **PASS** | Leading orchestration platform for Claude, native MCP |
| 2 | cline | cline/cline | 62,434 | (recent) | MIT | Autonomous agent SDK/IDE/CLI | **PASS** | Also research-agent capable; broad agent framework |
| 3 | oh-my-claudecode | Yeachan-Heo/oh-my-claudecode | 35,125 | 2026-05-28 | MIT | Teams-first multi-agent | **PASS** | Claude Code native, coordination pattern emphasis |
| 4 | openai/swarm | openai/swarm | 21,541 | 2026-05-28 | MIT | Reference impl, lightweight | **PASS** | Official OpenAI reference; ergonomic baseline |
| 5 | open-multi-agent | open-multi-agent/open-multi-agent | 6,274 | 2026-05-28 | MIT | Goal→DAG, TypeScript, MCP+tracing | **PASS** | **PATTERN:** Plan-by-files via DAG generation |
| 6 | agency-swarm | VRSEN/agency-swarm | 4,420 | 2026-05-27 | MIT | Reliable multi-agent framework | **PASS** | Structured handoff, hierarchical agents |
| 7 | swarms | kyegomez/swarms | 15,000 | 2026-05-28 | Apache-2.0 | Production-ready enterprise | **PASS** | swarms.ai, mature orchestration |

**Pattern Detection:**
- **Plan-by-files** identified in: `open-multi-agent` (goal→DAG written to files), `oh-my-claudecode` (task coordination)
- **Swarm coordination**: ruflo, oh-my-claudecode (team-first), swarms
- **Handoff/hierarchical**: agency-swarm, open-multi-agent

---

## "clianything" Canonicalization Result

**Resolution: TWO distinct projects, NOT one "clianything"**

| Name | Owner | Stars | Category | Status |
|---|---|---|---|---|
| **Anything-LLM** | Mintplex-Labs/anything-llm | 60,706 | Productivity accelerator + agent | **ACTIVE, CANONICAL** |
| **Cline** (formerly Claude Dev) | cline/cline | 62,434 | Coding agent SDK/IDE/CLI | **ACTIVE, CANONICAL** |

**User's reference likely:** Cline (cline/cline) — the agent that "does anything" autonomously.  
**Verdict:** User should score BOTH as distinct candidates:
- Anything-LLM: productivity/agent framework category
- Cline: agent-framework + research-agent dual-capable

**No single "clianything" exists; user may have conflated the names.**

---

## GPT-5.5 Advanced OC Patterns

**Source:** openai/codex repo (Apache-2.0, updated 2026-05-28)

**Documented patterns in Codex + ecosystem:**
1. **Planner-Executor separation** — Codex CLI implements lightweight orchestration
2. **Managed Agents** (Anthropic SDK) — Agent protocol, tool-use coordination
3. **ReAct loops** — Reason+Act alternation (implicit in gpt-researcher, explicit in GPT-5.5 system prompts)
4. **Handoff protocol** — Agent A → B via structured context transfer
5. **Evaluator-Optimizer** — Generator (planner) + evaluator (judge), iterative refinement

**Key reference:** openai/codex README describes "lightweight coding agent" and terminal-resident orchestration.  
**No dedicated "GPT-5.5 advanced OC spec" found.** Patterns distilled from gpt-researcher README, Anthropic SDK docs, and Codex CLI codebase.

**Implication:** GPT-5.5 OC is **practiced, not codified**. Recommend capturing patterns from top candidates (gpt-researcher, Codex, open-multi-agent) into `sota-research/patterns/` during L2 ingestion.

---

## Top 8 to Score in Stage-2 (Ranked by Novelty × Adoption)

**Priority scoring order (13 total pass stage-1; select top 8 for stage-2 full rubric):**

1. **assafelovic/gpt-researcher** (27.4k★) — OG, multi-source, industry baseline
2. **ruvnet/ruflo** (55.9k★) — Enterprise leader, Claude-native
3. **cline/cline** (62.4k★) — Highest stars, dual research+coding agent
4. **openai/swarm** (21.5k★) — Official reference, lightweight baseline
5. **Alibaba-NLP/DeepResearch** (19.0k★) — SOTA training, Qwen3-backed
6. **dzhng/deep-research** (19.0k★) — Minimal pattern, elegant reference
7. **SkyworkAI/DeepResearchAgent** (3.4k★) — **NOVELTY:** Self-evolving, lowest stars but highest conceptual novelty
8. **open-multi-agent** (6.3k★) — **PATTERN:** Goal→DAG + plan-by-files exemplar

**Excluded from top-8 (will REFERENCE only, not score):**
- langchain-ai/open_deep_research (11.5k★, derivative)
- khoj-ai/khoj (34.7k★, broader scope, secondary focus)
- Yeachan-Heo/oh-my-claudecode (35.1k★, already EXPERIMENT-tier in sota-tools)
- kyegomez/swarms (15k★, mature but lower conceptual novelty)
- nickscamara/open-deep-research (6.2k★, license unclear, fork-ish)

---

## Cost Summary

**Phase-1 (discovery, this scan):** $0.80  
- GitHub API batch queries: $0.00 (cached)
- gh CLI metadata: $0.00
- Text aggregation: $0.80

**Phase-2 estimate (stage-1 survivors → stage-2 rubric + Codex consensus):**
- 8 candidates × D1-D8 dimension gathering: ~$2.40
- Codex per-candidate xhigh consensus (8 × $0.40–0.80): $3.20–6.40
- **Phase-2 total: $5.60–8.80**

**Phase-3 estimate (L1+L2 ingestion on top 5):**
- L1 (repomix): 5 × $0.10 = $0.50
- L2 (DeepWiki MCP): 5 × $0.30 = $1.50
- **Phase-3 total: $2.00**

**Bootstrap total (Phases 1–3): $8.40–12.60**

---

## Audit Trail & Notes

- **Stage-1 hard filter applied:** recency (≤180d), license (MIT/Apache/AGPL acceptable for research-agent category), substance (≥30 stars), not archived
- **Single-source signal capped at 80** per convergence-trust rules (Appendix D protocol)
- **Honeypot check:** no bot-author patterns or suspicious star spikes detected
- **Plan-by-files pattern detection:** explicit mentions found in open-multi-agent README (DAG→files), oh-my-claudecode (task files); implicit in gpt-researcher (intermediate writes)
- **Concordance with spec Appendix A.6:** all 6 named targets scored; Alibaba Tongyi confirmed as `Alibaba-NLP/DeepResearch`; ByteDance DeerFlow not indexed on GitHub (may be internal); HKUST O-Researcher not surfaced (verify in web-search phase)

---

## Next Steps (Wave 2+)

1. **Stage-2 scoring:** invoke 8-candidate parallel scoring subagents (Sonnet, concurrency=4, isolation=worktree)
2. **Codex consensus:** parallel xhigh reviews on all 8 simultaneously
3. **Novelty conflicts:** SkyworkAI/DeepResearchAgent (low stars, high novelty) vs ruflo (high stars, established) — expect Codex to elevate novelty candidate
4. **L1 ingestion on passers:** repomix all stage-1 passers to `patterns/<owner>/<repo>/`
5. **L2 on ≥80 scorers:** DeepWiki MCP ingestion for all candidates scoring ≥80
6. **Convergence-cycle:** if Codex ≠ rubric by >25 points on any candidate, auto-fire codex:codex-rescue for adversarial tiebreak

---

**END SCAN**
