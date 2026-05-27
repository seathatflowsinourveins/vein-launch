---
name: team
description: Configure agent teams for a project. Use when asked about agent teams, parallel agents, or team configuration.
user-invocable: true
allowed-tools:
  - "Bash(node *)"
  - "Read"
  - "Write"
---

# /team — Agent Team Configuration

Manage agent team settings from `.vein.json`. Creates team configs at `~/.claude/teams/{name}/config.json`.

## Usage
- `/team status` — Show current team configuration
- `/team init <project>` — Initialize team from .vein.json agents section
