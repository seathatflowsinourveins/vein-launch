# CLI Argument Grammar

## Synopsis

```
vein [<project>] [--deep | --repair] [-- <claude-args>...]
vein --setup
vein --status
vein --projects
vein --accounts [add | remove | list | health]
vein --version
vein --help
```

## Flag Matrix

| Flag | Short | Requires Project | Mutually Exclusive With |
|------|-------|-----------------|------------------------|
| `--deep` | `-d` | Yes | `--repair`, `--setup`, `--status`, `--projects`, `--accounts` |
| `--repair` | `-r` | Yes | `--deep`, `--setup`, `--status`, `--projects`, `--accounts` |
| `--setup` | — | No | All others except `--help` |
| `--status` | — | No | All others except `--help` |
| `--projects` | — | No | All others except `--help` |
| `--accounts` | `-a` | No | `--deep`, `--repair`, `--setup`, `--status`, `--projects` |
| `--version` | — | No | All others |
| `--help` | — | No | None (always works) |

## Invalid Combinations (exit code 3)

- `vein --deep --repair` (pick one mode)
- `vein --setup trading` (setup is global, not per-project)
- `vein --deep` without project (which project?)
- `vein --deep --accounts` (operational vs management)

## Exit Codes

| Code | Meaning | When |
|------|---------|------|
| 0 | Success | All tiers pass or only warnings |
| 1 | Tier blocked | A block rule triggered (launch aborted) |
| 2 | Tier error | A tier threw an unexpected error |
| 3 | Config invalid | Bad .vein.json, invalid CLI args, or bad flag combo |
| 4 | Setup required | First-time setup not completed |
| 5 | Budget exceeded | Mode time budget exceeded (tiers skipped) |
| 99 | Internal error | Bug in vein-launch itself |

## Project Resolution

`vein trading` resolves "trading" to a directory:
1. Check `~/.vein/projects.json` for alias → path mapping
2. Check `C:\SEA\src\trading\` (convention: source root + name)
3. Check current directory for `.vein.json` with matching project name
4. Fail with exit code 3 if unresolvable

## Pass-Through Args

Everything after `--` passes directly to `claude`:
```
vein trading --deep -- --model opus --resume
```
