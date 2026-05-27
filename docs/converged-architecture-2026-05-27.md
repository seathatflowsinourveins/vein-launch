# Converged Architecture — vein-launch SOTA Foundation (May 2026)

> **Sources:** 10 research agents + GPT-5.5 Codex review + Docker SOTA agent
> **Date:** 2026-05-27
> **Status:** Converged (pending final GPT-5.5 folder structure verdict)

---

## Three-Location Architecture

```
┌─────────────────────────────────────────────────────────┐
│ C:\SEA\                    YOUR SOURCE CODE (NTFS)      │
│ ├── src/                   Projects you build            │
│ │   ├── vein-launch/       The launcher itself           │
│ │   ├── trading/           Autonomous trading system     │
│ │   └── evolve/            Research + self-evolving      │
│ ├── ref/                   11 SOTA reference repos       │
│ ├── docs/                  Guides, specs, research       │
│ └── archive/               Legacy (preserved)            │
├─────────────────────────────────────────────────────────┤
│ C:\Users\seath\            TOOL STATE (NTFS, auto-mgd)  │
│ ├── .claude/               Claude Code brain             │
│ ├── .codex/                GPT-5.5 config                │
│ ├── .config/               rtk, mise, starship           │
│ ├── .local/share/ruflo/    Ruflo data                    │
│ ├── bin/                   Binaries on PATH              │
│ └── .wslconfig             WSL2 resource limits          │
├─────────────────────────────────────────────────────────┤
│ WSL2 ~/docker/             CONTAINER STATE (ext4, fast)  │
│ ├── cliproxy/              CLIProxy stack (compose.yml)  │
│ │   ├── config.yaml        CLIProxy config               │
│ │   ├── compose.yml        Docker compose                │
│ │   └── secrets/           API keys (Docker secrets)     │
│ ├── trading/               Trading services stack        │
│ │   ├── compose.yml        TimescaleDB + Redis           │
│ │   ├── compose.override.yml  Dev overrides              │
│ │   └── secrets/           DB passwords                  │
│ └── backups/               pg_dump + auth token backups  │
└─────────────────────────────────────────────────────────┘
```

## Why Three Locations

| Location | Filesystem | Optimized for | Accessed by |
|----------|-----------|---------------|-------------|
| C:\SEA | NTFS | Source code editing, git operations | You + Claude Code + VS Code |
| ~/ | NTFS | Tool config lookup (hardcoded paths) | Claude Code + Codex + RTK + plugins |
| WSL2 ~/docker/ | ext4 | Docker volume I/O (5-10x faster than NTFS) | Docker Engine |

Moving .claude/ to C:\SEA would break 5 hooks + 2 MCP servers with hardcoded paths.
Moving Docker data to C:\SEA would cause 5-10x I/O penalty on volume operations.
The launcher bridges all three — `vein trading` resolves paths across locations.

## CLIProxy: Dual Hosting Mode

### Docker Mode (for projects using Docker — trading)

```yaml
# WSL2: ~/docker/cliproxy/compose.yml
services:
  cliproxy:
    image: eceasy/cli-proxy-api:latest
    ports: ["127.0.0.1:8317:8317"]
    volumes:
      - ./config.yaml:/CLIProxyAPI/config.yaml:ro
      - cliproxy-auths:/root/.cli-proxy-api
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:8317/v1/models > /dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
    develop:
      watch:
        - path: ./config.yaml
          action: sync+restart
          target: /CLIProxyAPI/config.yaml
volumes:
  cliproxy-auths:
```

### PM2 Mode (for lighter projects — evolve)

```powershell
# Windows native: ~/.vein/cliproxy/
pm2 start ~/.vein/cliproxy/cli-proxy-api.exe --name cliproxy
```

### Per-Project Selection (.vein.json)

```jsonc
// C:\SEA\src\trading\.vein.json
{ "cliproxy": { "hosting": "docker" } }  // Uses WSL2 Docker stack

// C:\SEA\src\evolve\.vein.json  
{ "cliproxy": { "hosting": "pm2" } }     // Uses native .exe + PM2
```

## WSL2 Configuration

```ini
# C:\Users\seath\.wslconfig
[wsl2]
memory=16GB
processors=8
swap=4GB
localhostForwarding=true

[experimental]
autoMemoryReclaim=gradual
```

## Docker Secret Management

| Credential | Method | Location |
|-----------|--------|----------|
| DB passwords | Docker secret (file) | WSL2: ~/docker/trading/secrets/ |
| Redis password | Docker secret (file) | WSL2: ~/docker/trading/secrets/ |
| CLIProxy management key | Docker secret (file) | WSL2: ~/docker/cliproxy/secrets/ |
| CLIProxy OAuth tokens | Named Docker volume | `cliproxy-auths` volume (managed by CLIProxy) |
| Non-secret config vars | .env file | Per-stack .env |

## Launch Flow (All Three Locations)

```
vein trading                          # From ANYWHERE
  │
  ├─ Resolve: "trading" → C:\SEA\src\trading
  ├─ Read: C:\SEA\src\trading\.vein.json → hosting: docker
  │
  ├─ T0: Check RTK (~/. config/rtk/) ✓
  ├─ T1: Check ENV (ANTHROPIC_BASE_URL) ✓
  ├─ T2: Check CLIProxy Docker:
  │   └─ wsl docker compose -f ~/docker/cliproxy/compose.yml ps
  │   └─ curl http://localhost:8317/health ✓
  │   └─ Cache validation (cache_read_input_tokens > 0) ✓
  ├─ T3: Check CLI tools (mise-managed) ✓
  │
  ├─ Set: ANTHROPIC_BASE_URL=http://localhost:8317
  ├─ Set: CLAUDE_CODE_SUBAGENT_MODEL=claude-haiku-4-5
  ├─ CWD: C:\SEA\src\trading
  │
  └─ exec claude --dangerously-skip-permissions
       │
       Reads: C:\SEA\src\trading\.claude/ (project)
       Reads: C:\Users\seath\.claude/ (global)
       Routes API through: localhost:8317 (CLIProxy in Docker)
```

## Backup Strategy

```bash
# WSL2 cron: daily at 2am
0 2 * * * ~/docker/scripts/backup.sh

# backup.sh:
docker exec trading-tsdb pg_dump -U trading trading -Fc -Z 9 > ~/docker/backups/trading-$(date +%Y%m%d).dump
docker run --rm -v cliproxy-auths:/data:ro -v ~/docker/backups:/bk alpine tar czf /bk/cliproxy-auths-$(date +%Y%m%d).tar.gz -C /data .
# Keep 7 daily + 4 weekly
```
