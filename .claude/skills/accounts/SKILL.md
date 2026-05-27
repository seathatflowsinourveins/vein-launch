---
name: accounts
description: Manage CLIProxy accounts — add, remove, list, health check. Use when asked about proxy accounts or API credentials.
user-invocable: true
allowed-tools:
  - "Bash(node *)"
  - "Read"
---

# /accounts — CLIProxy Account Management

Run `node src/orchestrator.mjs --accounts <subcommand>` to manage CLIProxy accounts.

## Subcommands
- `add` — Interactive account setup
- `remove <name>` — Remove an account
- `list` — Show all accounts + health
- `health` — Test auth validity for all accounts
