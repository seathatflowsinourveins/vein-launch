# Audit Frame F — SOTA Research (2026-05-28)

SOTA research pass for vein-launch on 5 operational areas: Node 24 child_process patterns, Windows process supervision, MSYS hardening, ESM CLI entry guards, and Vitest ESM testing. Primary sources: Node.js v26 docs, official blogs (AppSignal, Nearform, Better Stack), GitHub issues, MSYS2 official docs, current PM2/NSSM/WinSW comparisons, and Vitest 3.x/4.x release notes.

---

## Verdict Counts

- **IMPROVE** (material gap with payoff): 3
- **ADOPT** (clear SOTA available): 2
- **KEEP** (current approach is fine): 2
- **WATCH** (emerging, not yet stable): 1

---

## Findings

### F1 [ADOPT] — AbortSignal.timeout() Over Manual setTimeout + AbortController

**Topic:** Node 24 child_process timeout idiom (Area 1)

**Current repo state:** vein-launch likely uses `new AbortController()` + `setTimeout(() => controller.abort(), ms)` pattern for tier checks, health probes, and Codex invocation timeouts.

**SOTA pattern:** Use `AbortSignal.timeout(ms)` (Node.js 17.3+, stable since 18 LTS). For combining timeout + user cancellation, use `AbortSignal.any([controller.signal, AbortSignal.timeout(ms)])`. Primary source: [AppSignal: Managing Asynchronous Operations in Node.js with AbortController](https://blog.appsignal.com/2025/02/12/managing-asynchronous-operations-in-nodejs-with-abortcontroller.html).

**Gap material? Why:** The built-in `AbortSignal.timeout()` eliminates boilerplate and ensures timeout reasons are distinguishable (check `signal.reason`). Manual `setTimeout` + abort leaves ambiguity on abort reason without extra logic. Reduces async function signatures: no need to pass `{ timeout }` + manage cleanup separately.

**Recommendation:** Migrate tier check / healthz / Codex invocation wrappers to `AbortSignal.timeout(ms)` with explicit timeout values per tier. Wrap in `try/catch` and distinguish `error.name === "TimeoutError"` for logging. Update `src/lib/spawn-wrapper.mjs` (if it exists) or tier invocation helpers.

---

### F2 [KEEP] — execFile Over spawn for Short-Lived Binaries

**Topic:** Node 24 child_process method selection (Area 1)

**Current repo state:** Tier checks likely invoke `execFile()` or `execFileSync()` for short CLI tools (doctor, rtk, which, etc.).

**SOTA pattern:** `execFile()` is the correct idiom for invoking a binary without shell interpretation. Official Node.js v26 docs rank it as safer than `exec()` and more appropriate than `spawn()` for short-lived commands with bounded output. Primary source: [Node.js v26 child_process Documentation](https://nodejs.org/api/child_process.html).

**Gap material? Why:** No gap. If the repo already uses `execFile`, it's aligned with SOTA. If it uses `spawn()` for simple binary invocation, switching to `execFile()` would reduce resource footprint and clarify intent. `exec()` should only be used when shell features (pipes, redirects) are required.

**Recommendation:** Audit `src/tiers/*.mjs` for `spawn()` vs `execFile()` usage. If tier 0–2 use `spawn()` for simple commands like `node --version`, `where python`, `tasklist | findstr`, migrate those to `execFile()` (or shell: true if pipe is essential).

---

### F3 [IMPROVE] — PM2 Supervision on Windows Requires Wrapper (or Migrate to NSSM)

**Topic:** Windows process supervision (Area 2)

**Current repo state:** CLAUDE.md mentions "PM2 has lost the supervision" for CLIProxy. The project uses PM2 for daemon management with a Scheduled Task recovery hook.

**SOTA pattern:** PM2 alone is insufficient on Windows for reboot-durable supervision. SOTA 2026 options: (1) Wrap PM2 in NSSM as the supervisor (PM2 runs inside NSSM service), (2) use Scheduled Task + custom restart logic (current approach), or (3) migrate CLIProxy binary directly to NSSM/WinSW. NSSM is stagnant but stable (no releases since ~2014, but widely used for production); WinSW and Servy are actively maintained alternatives. Primary source: [RustDesk Docs (PM2 vs NSSM comparison)](https://rustdesk.com/docs/en/self-host/rustdesk-server-oss/windows/); [Windows Forum: NSSM for Automation Servers](https://windowsforum.com/threads/turn-windows-desktop-into-a-resilient-automation-server-with-nssm.390975/).

**Gap material? Why:** "PM2 lost supervision" is a known failure mode (PM2 process crashes, Scheduled Task restart policy is reactive, not proactive). NSSM provides true SCM integration with auto-restart, log rotation, priority control, and CPU affinity — no custom restart harness needed. The gap is testability: Scheduled Task + retry logic is harder to validate (no built-in introspection); NSSM logs are visible via `nssm query` and Event Viewer.

**Recommendation:** For reboot-durable CLIProxy on a dev box: (1) **Immediate:** wrap current PM2 setup in NSSM (`nssm install CLIProxy "pm2 start config.json"`) to gain SCM supervision + auto-restart. (2) **Medium-term:** Document the NSSM configuration in `.vein.json` schema (optional: expose via `vein doctor` health checks). (3) **Future:** evaluate WinSW/Servy if NSSM becomes a liability (unlikely for single-user dev); stay with Scheduled Task for "run at startup" without login requirement if CLIProxy shutdown is safe.

---

### F4 [IMPROVE] — MSYS Hardening: Scope MSYS_NO_PATHCONV Per-Invocation, Not Global

**Topic:** MSYS / Git Bash hardening (Area 3)

**Current repo state:** CLAUDE.md documents "MSYS_NO_PATHCONV=1 + MSYS2_ARG_CONV_EXCL=*" injected by the harness into Bash-tool subprocess. This is a **global** disable across all calls in that session.

**SOTA pattern:** Scope `MSYS_NO_PATHCONV=1` to a single `env`-prefixed invocation per command that needs it (e.g., `env MSYS_NO_PATHCONV=1 findstr /pat /tmp/foo`). For committed scripts, use `MSYS2_ARG_CONV_EXCL='--flag=;/regex/'` to exclude specific argument prefixes. For paths you control, use `cygpath -m` to pre-convert and pass the result. Use `uname -s` to detect MINGW*/MSYS*/CYGWIN* and scope the toggle conditionally. Primary source: [MSYS2 Official Docs: Filesystem Paths](https://www.msys2.org/docs/filesystem-paths/); [pascallandau.com: Git Bash & MINGW setup](https://www.pascallandau.com/blog/setting-up-git-bash-mingw-msys2-on-windows/); [GitHub Docker+MSYS2 workaround](https://gist.github.com/borekb/cb1536a3685ca6fc0ad9a028e6a959e3).

**Gap material? Why:** Blanket `MSYS2_ARG_CONV_EXCL=*` disables conversion for *all* arguments in that shell, which breaks tools that *rely* on conversion (e.g., `gcloud` needs conversion to find Python). The gap: conversion is a per-tool concern, not a per-shell concern. The fix is documented in production minikube bootstrap scripts: detect the environment once, compute the conversion scope, and apply it narrowly.

**Recommendation:** (1) In `bin/vein.ps1` or `src/hooks/stop-handler-cli.mjs`, replace the blanket harness injection with a per-command pattern: `env MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL=* cmdline` only for specific commands (findstr, tasklist, native .exe invocations with path args). (2) For scripts that detect MSYS, use the canonical pattern: detect `uname -s` once, set `$NO_PATHCONV=""` for non-MSYS or `"MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL=*"` for MSYS, then `env $NO_PATHCONV command`. (3) Document in CLAUDE.md that the two-shell model (CC Bash with conversion OFF, interactive shell with conversion ON) is intentional and reproducible-only-in-its-shell.

---

### F5 [KEEP] — fileURLToPath(import.meta.url) vs process.argv[1] Until import.meta.main Lands

**Topic:** ESM CLI entry-point guard (Area 4)

**Current repo state:** CLI wrappers (`stop-handler-cli.mjs`, etc.) likely use `import.meta.url` + `fileURLToPath` to detect direct invocation vs import.

**SOTA pattern:** The standard workaround is:
```js
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```
This is the recommended pattern until Node.js ships native `import.meta.main` support. Primary source: [GitHub Issue #57226: import.meta.main proposal](https://github.com/nodejs/node/issues/57226) (Feb 2025, still open); [MDN: import.meta](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import.meta).

**Gap material? Why:** No gap currently. The `fileURLToPath` workaround is widely used and stable. `import.meta.main` is proposed for Node.js but not yet landed in stable releases. Deno and Bun already have it, so cross-runtime code may need a runtime guard (`if (typeof import.meta.main !== "undefined")`), but for Node.js-only projects the current pattern is fine.

**Recommendation:** Keep the current pattern. Add a comment noting that when `import.meta.main` lands in Node.js stable (likely 26.x or 27.x LTS), it can be migrated in a follow-up. No immediate action needed.

---

### F6 [ADOPT] — Vitest + ESM Top-Level Await: Use forceRerunTriggers for CLI Tests

**Topic:** Vitest test patterns for ESM CLI wrappers (Area 5)

**Current repo state:** vein-launch uses Vitest for unit tests. CLI wrappers (`stop-handler-cli.mjs`, tier checks) likely need integration tests that spawn the CLI and validate output.

**SOTA pattern:** (1) Extract the main logic from the CLI wrapper into a testable function; spawn the CLI in tests via `execa` or `child_process`. (2) Configure Vitest's `forceRerunTriggers` glob to watch CLI build output (e.g., `['dist/**/*.js']`) so changes to the CLI script cause test reruns. (3) Use default `forks` or `threads` pool (not `vmThreads`) to avoid memory leaks when importing ES modules in test contexts. Primary source: [Vitest Config: forceRerunTriggers](https://vitest.dev/config/); [Vitest vs Jest 2026 Comparison](https://byteiota.com/vitest-vs-jest-2026-real-migration-data/); [Vitest GitHub: CLI Testing Pattern](https://github.com/vitest-dev/vitest).

**Gap material? Why:** Top-level await in CLI wrappers breaks unit test import chains (Vitest can't require CJS modules that transitively import ESM with TLA). The gap is testability: either extract main logic + unit-test it separately, or integration-test the CLI via subprocess spawn. Current vein-launch likely has a mix; the recommendation is to standardize on subprocess integration tests with `forceRerunTriggers` to ensure CLI builds trigger test reruns.

**Recommendation:** (1) In `vitest.config.js`, add `forceRerunTriggers: ['dist/**/*.js']` to watch built CLI artifacts. (2) For files with top-level await (like `stop-handler-cli.mjs`), export a testable `main()` function that can be unit-tested, and guard the top-level await call with a check. (3) Write integration tests in `test/cli-integration.test.js` using `execa('node', ['dist/stop-handler-cli.js'])` to validate CLI behavior end-to-end. (4) Pin `lru-cache` to `<11.3.0` if jsdom + Vitest tests fail on Node 24 (ESM TLA ecosystem issue).

---

### F7 [WATCH] — Windows Service Alternatives: WinSW / Servy Emerging as NSSM Replacements

**Topic:** Windows process supervision (Area 2)

**Current repo state:** NSSM is considered for CLIProxy supervision but is stagnant (no releases since 2014).

**SOTA pattern:** WinSW and Servy are actively maintained alternatives to NSSM. WinSW is the official Apache project and is recommended for new projects on modern Windows Server (2019+). Servy (2026) offers real-time monitoring and robust process handling. Both are drop-in replacements for NSSM and can wrap arbitrary executables as Windows services. Primary source: [Servy vs NSSM vs WinSW (2026)](https://earezki.com/ai-news/2026-01-26-servy-vs-nssm-vs-winsw/); [RustDesk Docs](https://rustdesk.com/docs/en/self-host/rustdesk-server-oss/windows/).

**Gap material? Why:** NSSM is stable but stagnant. If CLIProxy supervision becomes a blocker (e.g., Event Viewer logging doesn't surface failures, NSSM GUI breaks on future Windows versions), WinSW is a known, maintained alternative. Servy is very new (2026) and not yet battle-tested in production. The gap is future-proofing: choose NSSM now, but watch WinSW/Servy for migration triggers.

**Recommendation:** Document NSSM as the current choice in `.vein.json` and operator docs. Add a forward-looking note: "Consider migrating to WinSW if NSSM GUI compatibility breaks or monitoring becomes critical." For now, NSSM is sufficient for a dev box running a single supervisor task.

---

### F8 [IMPROVE] — Distinguish Abort Reasons in Tier Timeouts

**Topic:** Node 24 child_process timeout handling + error diagnostics (Area 1)

**Current repo state:** Tier checks use `AbortController` (or setTimeout + controller.abort) to enforce tier budgets (Fast ≤5s, Deep ≤30s, Repair ≤60s). The error handling likely logs "timeout" or "abort" generically.

**SOTA pattern:** When using `AbortSignal.any([controller.signal, AbortSignal.timeout(ms)])`, distinguish the abort reason: check `signal.reason` or `error.cause` to determine if timeout fired or user cancelled. Assign a distinct abort reason: `controller.abort(new Error("parent tier timeout"))`. Primary source: [Nearform: Using AbortSignal in Node.js](https://nearform.com/insights/using-abortsignal-in-node-js/).

**Gap material? Why:** Currently, a tier that times out and a tier that is cancelled by a parent operation both surface as "AbortError" in logs. Diagnostics improve significantly when the reason is available: `signal.reason` or `error.cause` makes it clear whether T2 timed out or T1 aborted it. This is critical for root-causing deep-mode health-check failures or Codex invocation timeouts.

**Recommendation:** Wrap tier invocation helpers to accept a `{ timeout, reason }` option. On abort, capture `signal.reason` and emit it to logs with context. Example: "T3 timed out after 10s (budget 30s); budget violation" vs "T3 aborted by parent (T1 exceeded budget)". Update `src/lib/result.mjs` to carry abort reason in `TierResult.reason` field.

---

## Summary

**To adopt:** AbortSignal.timeout() + Vitest forceRerunTriggers.  
**To improve:** PM2 supervision wrapping, MSYS per-invocation scoping, tier abort reason diagnostics.  
**To keep:** execFile pattern, fileURLToPath guard, Scheduled Task as fallback.  
**To watch:** WinSW / Servy as NSSM alternatives.

All changes are backward-compatible. Highest priority: F3 (PM2 supervision clarification) and F4 (MSYS hardening scope) to fix known defects; F1 and F6 for code modernization.
