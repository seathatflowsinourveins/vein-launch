# Project Meta-Architecture Design

> **Status:** Approved + Codex GPT-5.5 adversarial review converged  
> **Date:** 2026-05-27  
> **Scope:** Reusable project scaffold leveraging ruflo/codex/ecc on Windows 11  
> **Approach:** Independent repos + copier template (Approach A)  
> **Review:** 3 BLOCKERs fixed, 5 YAGNI cuts applied, 11 WARNINGs mitigated

## Prerequisites (Install Once)

| Tool | Purpose | Install |
|------|---------|---------|
| Docker Desktop | Container runtime (WSL2 backend recommended) | `winget install Docker.DockerDesktop` |
| copier >=9.x | Template engine with `copier update` drift-fix | `uv tool install copier` |
| just | Cross-platform task runner (replaces Make) | `winget install Casey.Just` |

### Docker Desktop Notes (from Codex review)

- **License:** Free for solo devs / companies <250 employees / <$10M revenue. Call out if collaborators join.
- **Backend:** Use WSL2 backend (not Hyper-V) — required for future CUDA/GPU passthrough.
- **Memory:** Set Docker Desktop memory limit to 4GB in Settings → Resources. Default 2GB is too low for backtesting + services.
- **I/O caveat:** Mounted volumes from `C:\` have 2-5x I/O penalty vs native Linux. For heavy data workloads (tick stores, parquet), keep data inside Docker volumes (not bind mounts) or migrate to WSL2 filesystem later.

## Template Scaffold (`~/dev/project-template/`)

```
~/dev/project-template/
├── copier.yml
├── .gitattributes                      ← enforce LF line endings (BLOCKER C4 fix)
├── {{ project_name }}/
│   ├── .claude/
│   │   ├── CLAUDE.md
│   │   ├── settings.json
│   │   ├── agents/domain-expert.md
│   │   ├── rules/{python,typescript,docker}.md
│   │   ├── commands/dev.md
│   │   └── skills/run/SKILL.md
│   ├── .mcp.json
│   ├── justfile                        ← cross-platform task runner (BLOCKER W2 fix)
│   ├── docker-compose.yml
│   ├── .devcontainer/{devcontainer.json,Dockerfile}
│   ├── .env.example
│   ├── .gitignore
│   ├── .gitattributes                  ← LF enforcement in generated project too
│   ├── README.md
│   ├── src/
│   └── tests/
```

### copier.yml (Template Config)

Prompts: `project_name`, `domain`, `stack` (python|node|both), `services` (postgres|timescaledb|redis|none), `port` (default 8000).

**Windows-critical settings (BLOCKER W1+C1 fix):**
```yaml
_tasks:
  # All hooks use PowerShell, not bash — Windows-native
  - command: pwsh -NoProfile -Command "Write-Host 'Project {{ project_name }} created'"
_jinja_extensions:
  - copier_templates_extensions.TemplateExtensionLoader
_exclude:
  - .git
```

**Path variable safety (BLOCKER C2 fix):**
All Jinja variables that hold filesystem paths use forward-slash normalization:
```jinja
{{ project_root | replace("\\", "/") }}
```

## Task Runner: justfile (not Makefile)

`just` is cross-platform (Windows/Mac/Linux), single binary, and doesn't require Make/MSYS.

```just
# justfile — project task runner

# Start local services
dev:
    docker compose up -d
    @echo "Services starting... waiting for health checks"
    docker compose exec -T {{ db_service }} pg_isready -U postgres || just wait-db

# Run tests
test:
    {{ test_command }}

# Lint + format
lint:
    {{ lint_command }}

# Stop services
down:
    docker compose down
```

## Project CLAUDE.md Pattern

Global `~/.claude/CLAUDE.md` = HOW Claude operates (principles, safety, workflows).  
Project `.claude/CLAUDE.md` = WHAT this project is (architecture, conventions, domain rules).

### Layer Boundary Rules (WARNING L1+L2 fix)

| Concern | Goes in GLOBAL | Goes in PROJECT | Never duplicated |
|---------|---------------|-----------------|-----------------|
| Operating principles | Yes | No | Verify-before-claim, plan-first, etc. |
| Tool preferences | Yes (ruff, biome, etc.) | Override ONLY if project deviates | State the deviation explicitly |
| Commit style | Yes | No | |
| Safety/permissions | Yes (deny rules) | Add-only (project allow) | |
| Architecture | No | Yes | |
| Domain rules | No | Yes | |
| Testing patterns | Generic (global) | Specific (project) | Project overrides generic |
| Deployment | No | Yes | |

### Template

```markdown
# {{ project_name }}

> Domain: {{ domain }}. Stack: {{ stack }}.
> Operating principles in global ~/.claude/CLAUDE.md — this file is WHAT, not HOW.
> If this file contradicts the global CLAUDE.md, this file wins for THIS project only.

## Architecture
[System purpose, key components, data flow — 2-3 sentences]

## Conventions
[Language/framework patterns specific to THIS project]
[ONLY list deviations from global CLAUDE.md — don't repeat what's already there]

## Testing
[Framework, how to run, coverage expectations]
[Integration tests: `just dev` then `just test`]

## Domain Rules
[Business constraints, invariants — links to .claude/rules/ for enforcement]

## Key Paths
- `src/` — application code
- `tests/` — test suite
- `justfile` — task runner (`just dev`, `just test`, `just lint`)
- `docker-compose.yml` — local services
```

## Project settings.json

```jsonc
{
  "permissions": {
    "allow": [
      "Bash(npm test*)", "Bash(npm run*)", "Bash(docker compose*)",
      "Bash(uv run*)", "Bash(pytest*)", "Bash(just *)"
    ]
  },
  "env": {
    "PROJECT_NAME": "{{ project_name }}",
    "DOCKER_COMPOSE_PROJECT_NAME": "{{ project_name }}"
  },
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "node",
        "args": [".claude/hooks/scripts/lint-on-save.mjs"],
        "if": "Write(**/*.py)|Edit(**/*.py)"
      }]
    }]
  }
}
```

Global `deny` rules (block-dangerous.py) cannot be overridden. Project settings only ADD.  
All hooks use node exec-form (not bash) per the ruflo fix pattern.

## Path-Scoped Rules

Lazy-loaded via `paths:` frontmatter. Zero overhead when not touching matching files.

- `python.md` — paths: `["**/*.py"]` — uv, type hints, pytest, ruff (format+lint)
- `typescript.md` — paths: `["**/*.ts", "**/*.tsx"]` — strict mode, vitest, biome
- `docker.md` — paths: `["**/Dockerfile", "**/docker-compose*"]` — multi-stage, no secrets, healthchecks

## Project Agents

Domain expert per project with persistent memory:

```markdown
---
model: sonnet
memory: project
tools: Read, Grep, Glob, WebFetch
---
You are a {{ domain }} domain expert for {{ project_name }}.
[Domain knowledge, constraints, evaluation criteria]
```

## Project Skills

- `/run` — start local dev (docker compose up, app start, browser open)
- `/dev` command — full dev environment setup with health checks

Skills use `shell: powershell` on Windows. `allowed-tools` pre-authorize project-safe commands.

## Docker Composition

Per-project `docker-compose.yml` with stack-selected services. Template uses Jinja conditionals based on `services` prompt.

Services available: TimescaleDB (pg16), PostgreSQL (16), Redis (7-alpine), NATS (latest).  
All services get healthchecks. Volumes are NAMED (not bind-mounts) for I/O performance on Windows.

## .gitattributes (BLOCKER C4 fix)

Included in both the template repo AND generated projects:

```
* text=auto eol=lf
*.ps1 text eol=crlf
*.cmd text eol=crlf
*.bat text eol=crlf
```

Ensures all generated files are LF (Linux-safe for Docker/CI) except Windows-specific scripts.

## .devcontainer

Extends project's docker-compose. Installs Claude Code CLI + project deps. Mounts `.claude/` for full agent support inside container.

## Ruflo Integration

- Shared memory DB (`~/data/memory/memory.db`) spans all projects
- Per-project namespacing via `memory_store namespace: "{{ project_name }}"`
- Hook telemetry (every tool call) feeds MoE router learning
- Domain expert agents use `memory: project` for persistent learnings
- No per-project ruflo config needed

## Codex Integration

- Global `~/.codex/config.toml` (gpt-5.5 @ xhigh) is default for all projects
- `/codex:review` fires as stop-gate after code changes
- `/codex:rescue` for second-model debugging
- Optional `.codex/config.toml` per-project for model overrides

## Unchanged (Global Layer)

- `~/.claude/CLAUDE.md` — global operating principles
- `~/.claude/settings.json` — global hooks, safety, permissions
- `~/.claude/hooks/` — block-dangerous.py, context-mode heal
- All 46 plugins, 18 MCP servers, ruflo infrastructure
- Codex global config

## YAGNI Cuts (from Codex review)

| Cut | Reason |
|-----|--------|
| Multi-environment profiles (dev/staging/prod) | Solo dev needs dev + prod only. Add staging when collaborators join. |
| Project registry (`projects.json`) | `ls ~/dev/` is the registry at this scale. |
| Renovate/Dependabot config | Noisy PR churn for solo dev. Add when CI pipeline exists. |
| OTEL/Jaeger in default compose | Solo dev doesn't need distributed tracing. Opt-in overlay later. |
| Migration tool abstraction layer | Use Alembic directly. Swap if needed (unlikely). |

## Implementation Order

1. Install Docker Desktop (`winget`) + copier (`uv tool`) + just (`winget`)
2. Create `~/dev/project-template/` with copier.yml + all template files
3. Stamp first project: `copier copy ~/dev/project-template trading`
4. Verify: `cd ~/dev/trading && claude` — CLAUDE.md loads, hooks fire, `just dev` works
5. Codex adversarial review of the generated trading project scaffold

## Codex GPT-5.5 Review Log

- **BLOCKERs fixed:** W1+C1 (bash→pwsh in hooks/tasks), W2 (Make→just), C2 (Jinja backslash→forward-slash filter)
- **WARNINGs mitigated:** C4 (.gitattributes LF), L1+L2 (layer boundary rules table), D2-D4 (Docker notes), W3 (named volumes not bind-mounts)
- **YAGNI applied:** 5 cuts (staging, registry, renovate, OTEL, migration abstraction)
- **OKs confirmed:** .env handling, Git LFS, copier answer file, Jinja logic, Docker for non-GPU, HOW/WHAT separation
