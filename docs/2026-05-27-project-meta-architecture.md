# Project Meta-Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reusable copier template that stamps out SOTA Claude Code project scaffolds with Docker, justfile, path-scoped rules, domain agents, and ruflo/codex integration — verified by generating the `trading` project.

**Architecture:** Independent repos (Approach A) with a shared copier template at `~/dev/project-template/`. Each generated project gets its own git repo, `.claude/` layer (WHAT not HOW), Docker services, and justfile. Global `~/.claude/` layer (HOW) stays unchanged.

**Tech Stack:** copier >=9.x (template engine), just (task runner), Docker Desktop (containers), Node.js (hook scripts), PowerShell (Windows-native scripting)

**Spec:** `~/dev/docs/superpowers/specs/2026-05-27-project-meta-architecture-design.md`

---

## File Map

### Template Repo (`~/dev/project-template/`)

| File | Responsibility |
|------|---------------|
| `copier.yml` | Template config: prompts, defaults, PowerShell tasks, Jinja settings |
| `.claude/CLAUDE.md.jinja` | Project CLAUDE.md (WHAT layer) |
| `.claude/settings.json.jinja` | Project hooks, permissions, env vars |
| `.claude/agents/domain-expert.md.jinja` | Domain-specific agent with persistent memory |
| `.claude/rules/python.md` | Path-scoped Python conventions |
| `.claude/rules/typescript.md` | Path-scoped TypeScript conventions |
| `.claude/rules/docker.md` | Path-scoped Docker conventions |
| `.claude/commands/dev.md.jinja` | `/dev` slash command |
| `.claude/skills/run/SKILL.md.jinja` | `/run` skill |
| `justfile.jinja` | Cross-platform task runner |
| `docker-compose.yml.jinja` | Stack-specific services (conditional) |
| `.devcontainer/devcontainer.json.jinja` | VS Code devcontainer |
| `.devcontainer/Dockerfile.jinja` | Dev container image |
| `.mcp.json.jinja` | Project-scoped MCP servers |
| `.env.example.jinja` | Documented env var template |
| `.gitignore` | Standard ignores |
| `.gitattributes` | LF enforcement |
| `README.md.jinja` | Project readme |
| `src/.gitkeep` | Source placeholder |
| `tests/.gitkeep` | Test placeholder |

---

### Task 1: Install Prerequisites

**Files:** None (system installs)

- [ ] **Step 1: Install copier via uv**

```powershell
uv tool install copier
```

Expected: `copier` available on PATH.

- [ ] **Step 2: Verify copier**

```powershell
copier --version
```

Expected: `copier 9.x.x` (must be >=9 for leading-dot directory support)

- [ ] **Step 3: Install just**

```powershell
winget install Casey.Just
```

Expected: `just` available on PATH after terminal restart.

- [ ] **Step 4: Verify just**

```powershell
just --version
```

Expected: `just 1.x.x`

- [ ] **Step 5: Install Docker Desktop**

```powershell
winget install Docker.DockerDesktop
```

Expected: Docker Desktop installs. Requires restart. After restart, open Docker Desktop, select **WSL2 backend** in Settings → General, set memory to **4GB** in Settings → Resources.

- [ ] **Step 6: Verify Docker**

```powershell
docker --version
docker compose version
docker run --rm hello-world
```

Expected: Docker version, compose version, "Hello from Docker!" message.

- [ ] **Step 7: Commit checkpoint**

No git commit here (system installs, not project files).

---

### Task 2: Create Template Repo + copier.yml

**Files:**
- Create: `~/dev/project-template/copier.yml`
- Create: `~/dev/project-template/.gitattributes`

- [ ] **Step 1: Initialize template repo**

```bash
mkdir -p ~/dev/project-template && cd ~/dev/project-template && git init
```

- [ ] **Step 2: Create .gitattributes (LF enforcement)**

Create `~/dev/project-template/.gitattributes`:

```
* text=auto eol=lf
*.ps1 text eol=crlf
*.cmd text eol=crlf
*.bat text eol=crlf
```

- [ ] **Step 3: Create copier.yml**

Create `~/dev/project-template/copier.yml`:

```yaml
_min_copier_version: "9.0.0"
_templates_suffix: ".jinja"
_exclude:
  - .git
  - __pycache__
  - "*.pyc"
  - .copier-answers.yml

# --- Prompts ---
project_name:
  type: str
  help: "Project name (lowercase, no spaces — becomes directory name and Docker prefix)"
  validator: "{% if not project_name | regex_search('^[a-z][a-z0-9-]*$') %}Must be lowercase alphanumeric with hyphens{% endif %}"

domain:
  type: str
  help: "Domain description (e.g., 'algorithmic trading', 'creative tech', 'deep learning')"
  default: "general"

stack:
  type: str
  help: "Primary language stack"
  choices:
    - python
    - node
    - both
  default: "python"

services:
  type: str
  help: "Docker services to include"
  choices:
    - timescaledb,redis
    - postgres,redis
    - redis
    - none
  default: "none"

port:
  type: int
  help: "Application port"
  default: 8000

# --- Computed ---
use_python:
  type: bool
  default: "{{ stack in ['python', 'both'] }}"
  when: false

use_node:
  type: bool
  default: "{{ stack in ['node', 'both'] }}"
  when: false

use_docker:
  type: bool
  default: "{{ services != 'none' }}"
  when: false

# --- Post-generation tasks (PowerShell, not bash — Windows-native) ---
_tasks:
  - command: "pwsh -NoProfile -Command \"Write-Host '✓ Project {{ project_name }} scaffolded' -ForegroundColor Green\""
```

- [ ] **Step 4: Verify copier.yml parses**

```bash
cd ~/dev/project-template && copier copy --defaults --data project_name=test-verify --data domain=test --data stack=python --data services=none --data port=8000 . /tmp/copier-verify 2>&1; echo "EXIT: $?"
```

Expected: Exits 0 (may warn about missing templates — that's fine, we haven't created them yet).

- [ ] **Step 5: Commit**

```bash
cd ~/dev/project-template && git add -A && git commit -m "feat: copier.yml template config + .gitattributes LF enforcement"
```

---

### Task 3: Template .claude/ Layer (CLAUDE.md + settings.json)

**Files:**
- Create: `~/dev/project-template/.claude/CLAUDE.md.jinja`
- Create: `~/dev/project-template/.claude/settings.json.jinja`

- [ ] **Step 1: Create project CLAUDE.md template**

Create `~/dev/project-template/.claude/CLAUDE.md.jinja`:

```markdown
# {{ project_name }}

> Domain: {{ domain }}. Stack: {{ stack }}.
> Operating principles in global ~/.claude/CLAUDE.md — this file is WHAT, not HOW.
> If this file contradicts the global CLAUDE.md, this file wins for THIS project only.

## Architecture

<!-- Replace this block with your actual architecture (2-3 sentences) -->
{{ project_name }} is a {{ domain }} project using {{ stack }}.

## Conventions
{% if use_python %}
- Python: uv for dependency management, ruff for lint+format, pytest for tests
- Type hints required on all public functions
{% endif %}
{% if use_node %}
- Node: npm for packages, biome for lint+format, vitest for tests
- Strict TypeScript mode
{% endif %}
- ONLY list deviations from global CLAUDE.md here — don't repeat what's already there

## Testing

- Run tests: `just test`
- Run linter: `just lint`
{% if use_docker %}
- Integration tests: `just dev` first to start Docker services
{% endif %}

## Domain Rules

<!-- Add domain-specific constraints and invariants here -->
See `.claude/rules/` for path-scoped enforcement.

## Key Paths

- `src/` — application code
- `tests/` — test suite
- `justfile` — task runner (`just dev`, `just test`, `just lint`)
{% if use_docker %}
- `docker-compose.yml` — local services
{% endif %}
```

- [ ] **Step 2: Create project settings.json template**

Create `~/dev/project-template/.claude/settings.json.jinja`:

```json
{
  "permissions": {
    "allow": [
{% if use_python %}
      "Bash(uv *)",
      "Bash(pytest*)",
{% endif %}
{% if use_node %}
      "Bash(npm test*)",
      "Bash(npm run*)",
{% endif %}
{% if use_docker %}
      "Bash(docker compose*)",
{% endif %}
      "Bash(just *)"
    ]
  },
  "env": {
    "PROJECT_NAME": "{{ project_name }}"{% if use_docker %},
    "DOCKER_COMPOSE_PROJECT_NAME": "{{ project_name }}"{% endif %}
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd ~/dev/project-template && git add -A && git commit -m "feat: project CLAUDE.md and settings.json templates"
```

---

### Task 4: Template Agents + Path-Scoped Rules

**Files:**
- Create: `~/dev/project-template/.claude/agents/domain-expert.md.jinja`
- Create: `~/dev/project-template/.claude/rules/python.md`
- Create: `~/dev/project-template/.claude/rules/typescript.md`
- Create: `~/dev/project-template/.claude/rules/docker.md`

- [ ] **Step 1: Create domain expert agent**

Create `~/dev/project-template/.claude/agents/domain-expert.md.jinja`:

```markdown
---
model: sonnet
memory: project
tools: Read, Grep, Glob, WebFetch
---

You are a {{ domain }} domain expert for the {{ project_name }} project.

## Your Role

- Answer domain-specific questions about {{ domain }}
- Review code changes for domain correctness
- Suggest domain-appropriate patterns and libraries
- Flag violations of domain constraints listed in `.claude/CLAUDE.md` → Domain Rules

## Context

- Stack: {{ stack }}
- Project root: the working directory
- Domain rules: see `.claude/rules/` for path-scoped enforcement
```

- [ ] **Step 2: Create Python rules**

Create `~/dev/project-template/.claude/rules/python.md`:

```markdown
---
paths: ["**/*.py"]
---

- Use `uv` for dependency management (`uv add`, `uv run`), not pip/conda
- Type hints required on all public functions and methods
- `pytest` for testing; test files in `tests/` mirror `src/` structure
- `ruff` for linting and formatting (`ruff check .`, `ruff format .`)
- Prefer dataclasses or Pydantic models over raw dicts for structured data
- Use `pathlib.Path` over `os.path`
```

- [ ] **Step 3: Create TypeScript rules**

Create `~/dev/project-template/.claude/rules/typescript.md`:

```markdown
---
paths: ["**/*.ts", "**/*.tsx"]
---

- TypeScript strict mode (`"strict": true` in tsconfig.json)
- `vitest` for testing, `biome` for lint+format
- Prefer explicit return types on exported functions
- Use `readonly` on properties that shouldn't be mutated
- Avoid `any` — use `unknown` and narrow with type guards
```

- [ ] **Step 4: Create Docker rules**

Create `~/dev/project-template/.claude/rules/docker.md`:

```markdown
---
paths: ["**/Dockerfile", "**/docker-compose*", "**/.devcontainer/**"]
---

- Multi-stage builds; final stage FROM slim base images
- No secrets in Dockerfile; use build args or runtime env vars
- All docker-compose services must have healthchecks
- Use named volumes (not bind mounts) for database data on Windows (I/O performance)
- .devcontainer extends project's docker-compose, not duplicates it
```

- [ ] **Step 5: Commit**

```bash
cd ~/dev/project-template && git add -A && git commit -m "feat: domain expert agent + path-scoped rules (python, ts, docker)"
```

---

### Task 5: Template Commands + Skills

**Files:**
- Create: `~/dev/project-template/.claude/commands/dev.md.jinja`
- Create: `~/dev/project-template/.claude/skills/run/SKILL.md.jinja`

- [ ] **Step 1: Create /dev command**

Create `~/dev/project-template/.claude/commands/dev.md.jinja`:

```markdown
Set up the full local development environment for {{ project_name }}.

## Steps

{% if use_docker %}
1. Start Docker services: `docker compose up -d`
2. Wait for health checks: `docker compose ps` until all services are healthy
{% endif %}
{% if use_python %}
3. Create Python venv: `uv sync`
{% endif %}
{% if use_node %}
4. Install Node deps: `npm install`
{% endif %}
5. Report ready status with service URLs
```

- [ ] **Step 2: Create /run skill**

Create `~/dev/project-template/.claude/skills/run/SKILL.md.jinja`:

```markdown
---
name: run
description: Start the {{ project_name }} application locally
shell: powershell
allowed-tools: Bash(docker compose*), Bash(just *){% if use_python %}, Bash(uv run*){% endif %}{% if use_node %}, Bash(npm run*){% endif %}
---

Start the local development server for {{ project_name }}.

1. Ensure services are running: `just dev`
{% if use_python %}
2. Start the application: `uv run python -m {{ project_name | replace("-", "_") }}`
{% endif %}
{% if use_node %}
2. Start the application: `npm start`
{% endif %}
3. Application should be available at http://localhost:{{ port }}
```

- [ ] **Step 3: Commit**

```bash
cd ~/dev/project-template && git add -A && git commit -m "feat: /dev command + /run skill templates"
```

---

### Task 6: Template Docker Files

**Files:**
- Create: `~/dev/project-template/docker-compose.yml.jinja`
- Create: `~/dev/project-template/.devcontainer/devcontainer.json.jinja`
- Create: `~/dev/project-template/.devcontainer/Dockerfile.jinja`

- [ ] **Step 1: Create docker-compose.yml template**

Create `~/dev/project-template/docker-compose.yml.jinja`:

```yaml
{% if use_docker %}
services:
{% if 'timescaledb' in services %}
  timescaledb:
    image: timescale/timescaledb:latest-pg16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: ${DB_USER:-{{ project_name | replace("-", "_") }}}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-localdev}
      POSTGRES_DB: ${DB_NAME:-{{ project_name | replace("-", "_") }}}
    volumes:
      - tsdb-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
{% endif %}
{% if 'postgres' in services and 'timescaledb' not in services %}
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: ${DB_USER:-{{ project_name | replace("-", "_") }}}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-localdev}
      POSTGRES_DB: ${DB_NAME:-{{ project_name | replace("-", "_") }}}
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
{% endif %}
{% if 'redis' in services %}
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
{% endif %}

volumes:
{% if 'timescaledb' in services %}
  tsdb-data:
{% endif %}
{% if 'postgres' in services and 'timescaledb' not in services %}
  pg-data:
{% endif %}
{% else %}
# No Docker services configured. Add services with:
#   copier update --data services=timescaledb,redis
{}
{% endif %}
```

- [ ] **Step 2: Create devcontainer.json template**

Create `~/dev/project-template/.devcontainer/devcontainer.json.jinja`:

```json
{
  "name": "{{ project_name }}",
{% if use_docker %}
  "dockerComposeFile": ["../docker-compose.yml"],
  "service": "devcontainer",
{% else %}
  "build": {
    "dockerfile": "Dockerfile"
  },
{% endif %}
  "customizations": {
    "vscode": {
      "extensions": [
{% if use_python %}
        "ms-python.python",
        "charliermarsh.ruff",
{% endif %}
{% if use_node %}
        "biomejs.biome",
{% endif %}
        "anthropics.claude-code"
      ]
    }
  },
  "forwardPorts": [{{ port }}]
}
```

- [ ] **Step 3: Create dev Dockerfile template**

Create `~/dev/project-template/.devcontainer/Dockerfile.jinja`:

```dockerfile
{% if use_python %}
FROM python:3.13-slim
RUN pip install uv
{% elif use_node %}
FROM node:24-slim
{% else %}
FROM ubuntu:24.04
{% endif %}

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl jq && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
```

- [ ] **Step 4: Commit**

```bash
cd ~/dev/project-template && git add -A && git commit -m "feat: docker-compose + devcontainer templates (conditional services)"
```

---

### Task 7: Template Project Files

**Files:**
- Create: `~/dev/project-template/justfile.jinja`
- Create: `~/dev/project-template/.mcp.json.jinja`
- Create: `~/dev/project-template/.env.example.jinja`
- Create: `~/dev/project-template/.gitignore`
- Create: `~/dev/project-template/.gitattributes.jinja`
- Create: `~/dev/project-template/README.md.jinja`
- Create: `~/dev/project-template/src/.gitkeep`
- Create: `~/dev/project-template/tests/.gitkeep`

- [ ] **Step 1: Create justfile template**

Create `~/dev/project-template/justfile.jinja`:

```just
# {{ project_name }} — task runner
# Run `just` to see available commands

# Default: list commands
default:
    @just --list

{% if use_docker %}
# Start local Docker services
dev:
    docker compose up -d
    @echo "Waiting for services..."
    @docker compose ps --format "{{"{{"}}.Name{{"}}"}} {{"{{"}}.Status{{"}}"}}"
{% endif %}

# Run tests
test:
{% if use_python %}
    uv run pytest tests/ -v
{% elif use_node %}
    npm test
{% endif %}

# Lint + format check
lint:
{% if use_python %}
    uv run ruff check .
    uv run ruff format --check .
{% elif use_node %}
    npx biome check .
{% endif %}

# Format code
fmt:
{% if use_python %}
    uv run ruff format .
{% elif use_node %}
    npx biome format --write .
{% endif %}

{% if use_docker %}
# Stop Docker services
down:
    docker compose down

# View service logs
logs *args='':
    docker compose logs {{ '{{' }}args{{ '}}' }}
{% endif %}
```

- [ ] **Step 2: Create .mcp.json (empty — add project MCP servers as needed)**

Create `~/dev/project-template/.mcp.json.jinja`:

```json
{
  "mcpServers": {}
}
```

- [ ] **Step 3: Create .env.example**

Create `~/dev/project-template/.env.example.jinja`:

```bash
# {{ project_name }} environment variables
# Copy to .env and fill in values: cp .env.example .env

PROJECT_NAME={{ project_name }}
{% if use_docker %}
{% if 'timescaledb' in services or 'postgres' in services %}
DB_USER={{ project_name | replace("-", "_") }}
DB_PASSWORD=localdev
DB_NAME={{ project_name | replace("-", "_") }}
DB_HOST=localhost
DB_PORT=5432
{% endif %}
{% if 'redis' in services %}
REDIS_URL=redis://localhost:6379
{% endif %}
{% endif %}
```

- [ ] **Step 4: Create .gitignore**

Create `~/dev/project-template/.gitignore`:

```
# Python
__pycache__/
*.pyc
.venv/
*.egg-info/
dist/
.ruff_cache/

# Node
node_modules/
dist/
.next/

# Environment
.env
.env.local

# IDE
.vscode/
.idea/

# Claude Code
.claude/settings.local.json

# Docker
data/

# OS
.DS_Store
Thumbs.db
```

- [ ] **Step 5: Create .gitattributes for generated project**

Create `~/dev/project-template/.gitattributes.jinja`:

```
* text=auto eol=lf
*.ps1 text eol=crlf
*.cmd text eol=crlf
*.bat text eol=crlf
```

- [ ] **Step 6: Create README.md**

Create `~/dev/project-template/README.md.jinja`:

```markdown
# {{ project_name }}

{{ domain }} project using {{ stack }}.

## Quick Start

```bash
{% if use_docker %}
just dev          # Start Docker services
{% endif %}
just test         # Run tests
just lint         # Lint check
```

## Development

{% if use_docker %}
Requires Docker Desktop. Services defined in `docker-compose.yml`.
{% endif %}

Task runner: [just](https://just.systems/) — run `just` to see all commands.

## Claude Code

This project is configured for Claude Code. Run `claude` from the project root.

- `.claude/CLAUDE.md` — project context and conventions
- `.claude/rules/` — path-scoped coding rules
- `.claude/agents/domain-expert.md` — domain-specific agent
- `/dev` command — set up full environment
- `/run` skill — start the application
```

- [ ] **Step 7: Create placeholder directories**

```bash
mkdir -p ~/dev/project-template/src ~/dev/project-template/tests
touch ~/dev/project-template/src/.gitkeep ~/dev/project-template/tests/.gitkeep
```

- [ ] **Step 8: Commit**

```bash
cd ~/dev/project-template && git add -A && git commit -m "feat: justfile, .mcp.json, .env.example, .gitignore, .gitattributes, README"
```

---

### Task 8: Stamp First Project (trading)

**Files:** Generated from template into `~/dev/trading/`

- [ ] **Step 1: Remove existing empty trading directory**

```bash
rm -rf ~/dev/trading
```

- [ ] **Step 2: Generate trading project from template**

```bash
copier copy ~/dev/project-template ~/dev/trading \
  --data project_name=trading \
  --data domain="algorithmic trading" \
  --data stack=python \
  --data services=timescaledb,redis \
  --data port=8000
```

Expected: `~/dev/trading/` created with all template files rendered.

- [ ] **Step 3: Verify generated structure**

```bash
find ~/dev/trading -type f | sort
```

Expected: All template files present with `trading` substituted into names/content.

- [ ] **Step 4: Verify CLAUDE.md rendered correctly**

```bash
cat ~/dev/trading/.claude/CLAUDE.md
```

Expected: Contains "trading", "algorithmic trading", "python", no raw `{{ }}` tokens.

- [ ] **Step 5: Verify settings.json is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('$HOME/dev/trading/.claude/settings.json','utf8'));console.log('VALID')"
```

Expected: `VALID`

- [ ] **Step 6: Verify docker-compose.yml has TimescaleDB + Redis**

```bash
cat ~/dev/trading/docker-compose.yml
```

Expected: Contains `timescaledb` and `redis` service blocks with healthchecks.

- [ ] **Step 7: Verify justfile has correct commands**

```bash
cd ~/dev/trading && just --list
```

Expected: Lists `dev`, `test`, `lint`, `fmt`, `down`, `logs` commands.

- [ ] **Step 8: Initialize git repo for trading project**

```bash
cd ~/dev/trading && git init && git add -A && git commit -m "feat: initial scaffold from project-template (copier)"
```

---

### Task 9: End-to-End Verification

**Files:** None (verification only)

- [ ] **Step 1: Claude Code loads project CLAUDE.md**

```bash
cd ~/dev/trading && claude --print-config 2>&1 | head -20
```

Expected: Shows the trading project's CLAUDE.md content being loaded.

- [ ] **Step 2: Docker services start (if Docker Desktop is installed and running)**

```bash
cd ~/dev/trading && just dev
```

Expected: TimescaleDB and Redis containers start, health checks pass.

- [ ] **Step 3: Verify Docker services are healthy**

```bash
docker compose -f ~/dev/trading/docker-compose.yml ps
```

Expected: Both services show "healthy" status.

- [ ] **Step 4: Test just commands**

```bash
cd ~/dev/trading && just down
```

Expected: Services stop cleanly.

- [ ] **Step 5: Verify .gitattributes prevents CRLF**

```bash
cd ~/dev/trading && file .claude/CLAUDE.md
```

Expected: `UTF-8 text` (no `CRLF line terminators`).

- [ ] **Step 6: Store verification in ruflo memory**

```bash
# Via ruflo MCP: store ecosystem pattern
# This is done via Claude Code session, not bash
```

Call `mcp__ruflo__memory_store` with:
- key: `project-template-verified-2026-05-27`
- namespace: `ecosystem`
- value: `{"template":"~/dev/project-template","firstProject":"trading","stack":"python","services":["timescaledb","redis"],"verified":true}`
- tags: `["template", "trading", "verified"]`

---

## Completion Criteria

1. `copier`, `just`, Docker Desktop all installed and on PATH
2. `~/dev/project-template/` is a git repo with copier.yml + all template files
3. `~/dev/trading/` generated from template with trading-specific values
4. CLAUDE.md, settings.json, docker-compose.yml all render correctly (no raw Jinja)
5. `just dev` starts Docker services; `just test` / `just lint` commands work
6. `.gitattributes` enforces LF line endings
7. Claude Code session in `~/dev/trading/` loads the project CLAUDE.md layer
