# vein-launch — Next Session Prompts (FINAL, GPT-5.5 Converged)

> 26/26 decisions audited. Full automation. bypassPermissions + hook safety stack.

---

## Advanced Prompt (THE ONE TO USE)

```
I'm building vein-launch — a SOTA Claude Code launcher. FULLY DESIGNED, GPT-5.5 CONVERGED. Execute implementation now.

READ FIRST:
- ~/.remember/remember.md (handoff state)
- Memory: vein-launch-project.md  
- Final spec: C:\SEA\ref\vein-launch-specs\2026-05-27-vein-launch-final-spec.md
- Research: C:\SEA\ref\vein-launch-specs\2026-05-27-vein-launch-sota-research.md
- Architecture: C:\SEA\docs\converged-architecture-2026-05-27.md
- Docker commands: C:\SEA\docs\docker-setup-commands.md

ARCHITECTURE (GPT-5.5 APPROVED, 26/26):
Three locations: C:\SEA (source) + ~/ (tool state) + WSL2 ~/docker/ (containers)

FULL AUTOMATION MODE:
- bypassPermissions — block-dangerous.py + deny list are the enforcement layer
- GPT-5.5 Codex xhigh review on every stop (quality gate replaces permission prompts)
- Ship-gate dual-model (Claude + GPT-5.5) before any merge
- TeammateIdle hook: tests + exit 2 on failure (self-correcting agent teams)
- Autonomous loops enabled for evolve project

GIT PRACTICE (SOTA):
- Conventional commits enforced by commitlint + Lefthook pre-commit
- SSH signing (not GPG) for all commits
- GitHub Rulesets v2 (not legacy branch protection): required reviews, status checks, signatures, deletion protection
- Squash-and-merge as default merge strategy
- Trunk-based: main protected, feature/fix/chore short-lived branches
- release-please auto-changelog + semver from commit types
- All GitHub Actions SHA-pinned (pinact enforced)
- Gitleaks pre-commit + TruffleHog CI (layered secret scanning)
- CodeQL SAST scheduled weekly

GITNEXUS:
- T6 codegraph tier: background post-launch indexing
- Auto-index when repo changed since last index
- Primary session only triggers re-index (not worktree sessions)
- GitNexus MCP tools available for impact analysis, code exploration, PR review

GPT-5.5 CONVERGENCE:
- Codex CLI authenticated (GPT-5.5 @ xhigh, config: ~/.codex/config.toml)
- Stop-review gate: every turn reviewed before next
- /codex:rescue for stuck situations or second opinion
- /ship-gate for pre-merge dual-model convergence
- Adversarial review on architecture decisions (/codex:adversarial-review)

GITHUB WORKFLOWS (5 core):
1. ci.yml — PR gate: biome lint + vitest + promptfoo eval (windows-latest runner)
2. codeql.yml — SAST: JavaScript security queries (weekly + on PR)
3. commitlint.yml — Conventional commit format enforcement
4. dependency-review.yml — Block known-vulnerable deps on PR
5. release-please.yml — Auto-release: changelog + version bump + tag + npm publish

DOCKER (SOTA, inside WSL2):
- CLIProxy: separate compose stack at ~/docker/cliproxy/ (Docker default, PM2 fallback)
- Trading: separate stack at ~/docker/trading/ (TimescaleDB + Redis + Langfuse profile)
- Docker secrets for passwords, .env for non-sensitive only
- Health checks: all 4 params + condition: service_healthy
- Compose Watch: sync+restart for CLIProxy config
- Backup: pg_dump daily + auth token volume tar + 7-day retention

TOKEN OPTIMIZATION STACK:
- RTK v0.42 native Rust hook (63 commands, transparent rewrite)
- context-mode plugin (~98% tool output reduction)
- Observation masking (52% savings, JetBrains-validated)
- Proactive /compact at 70-75% (before 83.5% autocompact)
- MCP Tool Search (when not proxied) or explicit ENABLE_TOOL_SEARCH config

MODEL ROUTING:
- Default: Opus 4.7 (1M context)
- Subagents: CLAUDE_CODE_SUBAGENT_MODEL=claude-haiku-4-5 (automatic)
- Planning: /model opusplan (Opus plans, Sonnet executes)
- Scouts: scout-haiku agent for mechanical lookups
- Per-project override via .vein.json modelRouting

EXECUTE NOW:
1. rmdir ~/src ~/ref (empty locked dirs)
2. Create C:\SEA\src\vein-launch\ — git init, npm init (type: module)
3. Scaffold FULL folder structure from spec §19:
   - bin/ (vein.cmd, vein.ps1)
   - src/ (orchestrator, tiers, cliproxy, hooks, quality, setup, lib, rules)
   - config/ (default.json, schema.json, cliproxy templates)
   - tests/ (per-tier, cliproxy, hooks, orchestrator, fixtures)
   - .claude/ (settings.json, agents, skills, rules, commands)
   - agent_docs/ (architecture, conventions, tiers, cliproxy, cache-safety)
   - evals/ (promptfooconfig.yaml)
   - .github/workflows/ (5 files)
   - .devcontainer/ (features-based)
   - CLAUDE.md, PLUGIN.md, .mise.toml, biome.json, lefthook.yml, vitest.config.mjs
4. Move specs from C:\SEA\ref\vein-launch-specs\ into repo docs/
5. Install: mise, RTK (rtk init -g), lefthook install
6. Write 6 Wave-0 interface contracts:
   a. CLI argument grammar (flag matrix, invalid combos, exit codes)
   b. .vein.json JSON Schema (defaults, required, versioning, security)
   c. TierResult type (timing, severity, evidence, cache source, diagnostics)
   d. Hook ordering (launcher vs RTK vs Codex vs ruflo, conflict resolution)
   e. Env propagation (ANTHROPIC_BASE_URL, ENABLE_TOOL_SEARCH, SUBAGENT_MODEL, inheritance)
   f. .vein.json security model (what .vein.json CAN'T do, malicious config threat model)
7. Invoke /superpowers:writing-plans for Wave 1-9 implementation plan
8. Execute waves with:
   - Parallel subagents (isolation: worktree) for independent modules
   - GPT-5.5 review gate on every major change
   - Agent teams for parallel work (manual worktree + TeammateIdle gate)
   - Conventional commits, SSH signing
   - Tests before every commit (vitest + biome)

QUALITY CHAIN (every session):
Prechecks T0-T6 → Launch (auto mode) → [Every turn: RTK compress + context-mode sandbox]
  → [Every stop: GPT-5.5 Codex xhigh review] → [Teams: TeammateIdle test gate]
  → [Pre-PR: /ship-gate dual-model] → [CI: biome + vitest + promptfoo + CodeQL]
  → [Merge: squash-and-merge, release-please auto-tag]
```

## /goal Prompt

```
Build and ship vein-launch v1.0.

Architecture: C:\SEA + ~/ + WSL2 ~/docker/ (GPT-5.5 approved).
Mode: bypassPermissions + hook safety stack + GPT-5.5 every stop.

Waves:
0: Scaffold + 6 interface contracts
1: Core launcher (PS1 entry, orchestrator, config, reporter)
2: Tiers T0-T3 (RTK, ENV, CLIProxy+cache, CLI tools via mise)
3: Tiers T4-T6 + block rules (GitHub, drift, codegraph)
4: CLIProxy manager (Docker+PM2 dual, accounts, cache-check)
5: Parallel sessions + agent teams + quality gates
6: Codex review hook + ship-gate + test-gate + promptfoo
7: Setup automation (vein --setup: WSL2, Docker, RTK, CLIProxy, tools, git, mise)
8: Project management (--projects, .vein.json, aliases, multi-launch)
9: GitHub workflows + npm packaging + README

Ship: dual-model review → v1.0 tag → npm publish

Success: `vein trading` from anywhere → all green → Claude launches fully armed.
```

## Docker-First (if starting with infrastructure)

```
Set up WSL2 + Docker Desktop + CLIProxy + trading stacks.
Follow C:\SEA\docs\docker-setup-commands.md phases 0-7.
After CLIProxy healthy at localhost:8317, create vein-launch repo.
```
