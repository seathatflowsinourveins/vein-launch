---
paths:
  - "src/cliproxy/**"
  - "config/cliproxy/**"
---
# Cache Safety Rules

When modifying CLIProxy configuration or proxy-related code:

1. Never add timestamps to system prompts — they break prompt cache keys
2. Never switch models mid-session through proxy config
3. Never add/remove MCP tools mid-session (invalidates cache)
4. Proxy must NOT re-serialize JSON (changes key ordering = cache miss)
5. Always validate cache_read_input_tokens > 0 after proxy changes
