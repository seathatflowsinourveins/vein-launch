# Tier Reference

## Tier Execution Order

| Tier | Name | Fast | Deep | Repair | Budget Share |
|------|------|------|------|--------|-------------|
| T0 | RTK | check | check | check + repair | 500ms |
| T1 | ENV | check | check | check + prune | 500ms |
| T2 | CLIProxy | process check | + account audit + cache health | + restart | 5s |
| T3 | CLI Tools | check | check | + mise install | 2s |
| T4 | GitHub | skip | check | check + repair | 5s |
| T5 | Drift | skip (roster only) | + smoke (24h cache) | same | 10s |
| T6 | CodeGraph | skip | skip | background post-launch | 0 (async) |

## Severity Semantics

| Severity | Meaning | Action |
|----------|---------|--------|
| `pass` | Check succeeded | Continue |
| `info` | Notable but fine | Log, continue |
| `warn` | Degraded but launchable | Log warning, continue |
| `block` | Cannot launch safely | Abort with exit 1, show remediation |
| `skip` | Tier not applicable to current mode | Don't run |
| `error` | Tier itself failed (bug) | Abort with exit 2 |

## Block Rule Mapping

| Block | Tier | Auto-Repair? |
|-------|------|-------------|
| B1 (leaked cred) | T1 | No |
| B4 (Docker down) | T2 | No |
| B5 (CLIProxy unhealthy) | T2 | Yes |
| B6 (zero accounts) | T2 | No |
| B7 (GitHub auth) | T4 | No |
| B9 (MCP drift) | T5 | Yes |
| B10 (SHA floating) | T4 | Yes |
