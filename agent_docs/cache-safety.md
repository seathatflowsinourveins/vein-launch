# Cache Safety

## Why This Matters

Prompt caching saves ~90% on repeated prefixes (system prompt, tool definitions, conversation history). A proxy that breaks cache keys silently costs 10x more with no visible error. The T2 deep-mode cache validation exists specifically to catch this.

## Validation Protocol

1. Send request A through proxy (any simple prompt)
2. Send identical request A again
3. Check response: `usage.cache_read_input_tokens > 0`
4. If zero: proxy is breaking cache keys → WARN loudly

## Safe Proxy Configuration

- `stabilize-device-profile: true` in CLIProxy config
- `session-affinity: true` for round-robin routing
- Never add `X-Request-ID` or other unique headers per request
- Retry with same credentials (don't rotate on retry)

## Integration with Tiers

- T2-cliproxy `check()` in deep mode runs the cache validation
- T2-cliproxy `repair()` regenerates config from template if validation fails
- Cache check results are stored in TierResult.diagnostics.cacheHealth
