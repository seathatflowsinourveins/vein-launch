# Hidden errors — Frame 1b (security-reviewer substitute)

## Verdict counts
- P0 (security/breakage): 1
- P1 (correctness): 1
- P2 (style/maintainability): 0
- discuss (ambiguous): 0

## Findings

### F1 [P0] — CLIPROXY_PORT default mismatch
**File:** `src/setup/doctor.mjs:218`
**What:** Doctor health check uses port "3284" as fallback, but hud-bridge.mjs and project defaults use 8317.
**Why it matters:** A misconfigured CLIProxy port can cause the doctor to report false pass (checking wrong port) and prevent the HUD from connecting to the proxy, breaking the integration between vein-launch and claude-hud.
**Reproducer:** Set no CLIPROXY_PORT env var, run `vein --doctor` with actual proxy on 8317 — the /healthz check will fail silently against port 3284.
**Recommendation:** Change line 218 from `const port = process.env.CLIPROXY_PORT ?? "3284";` to `const port = process.env.CLIPROXY_PORT ?? "8317";` to match hud-bridge.mjs (line 25) and config/default.json.

### F2 [P1] — Unvalidated port number in hud-bridge config
**File:** `tools/hud-bridge.mjs:64`
**What:** Port is read from env/file and converted to Number without range validation.
**Why it matters:** An invalid port (0, 65536, negative) will silently pass through and cause HTTP requests to fail obscurely. While non-critical (only affects HUD updates), validation aligns with the security policy in config.mjs (which validates 1024-65535).
**Reproducer:** Set `CLIPROXY_PORT=999999` and run hud-bridge — no error raised, just silent request failures.
**Recommendation:** Add a simple range check: `if (cliproxyPort < 1 || cliproxyPort > 65535) throw new Error(\`Invalid CLIPROXY_PORT: ${cliproxyPort}\`);` after line 65.

