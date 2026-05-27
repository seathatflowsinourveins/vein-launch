# CLIProxy Integration

## Dual Hosting

| Mode | When | Managed By | Config Location |
|------|------|-----------|----------------|
| Docker | .vein.json `cliproxy.hosting: "docker"` | docker compose in WSL2 | ~/docker/cliproxy/ |
| PM2 | .vein.json `cliproxy.hosting: "pm2"` (default) | PM2 process manager | ~/.vein/cliproxy/ |

## Health Check Flow

```
1. Process check (Docker: `docker compose ps`, PM2: `pm2 describe cliproxy`)
2. HTTP health: GET http://localhost:{port}/health (timeout: 3s)
3. Account audit (deep mode): verify ≥1 active account
4. Cache validation (deep mode): send 2 identical requests, verify cache_read_input_tokens > 0
```

## Cache Killers (CRITICAL)

These break prompt caching through the proxy:
1. **Timestamps in system prompt** — never include current time in system messages
2. **Model switching mid-session** — each model has its own cache namespace
3. **Adding/removing MCP tools mid-session** — tool list is part of the cache key
4. **Proxy JSON re-serialization** — proxy must pass request body as-is, not re-encode

## Account Management

Accounts are names (e.g., "claude-1") referencing credentials in ~/.cli-proxy-api/.
The launcher manages account lifecycle but never reads or writes actual tokens.

Commands:
- `vein --accounts add` — interactive account setup
- `vein --accounts remove <name>` — remove an account
- `vein --accounts list` — show all accounts + health status
- `vein --accounts health` — test all accounts for auth validity
