# Audit Frame A — Codex GPT-5.5

## Verdict counts (P0/P1/P2/Discuss)

P0: 0  
P1: 5  
P2: 7  
Discuss: 0

## Findings

### F1 [P1]
File: `src/setup/doctor.mjs:196`, `src/lib/persist.mjs:25`

What: `doctor` checks `data.results`, but production persistence writes `tiers`.

Why: A real successful deep run persisted by `persistResults()` will still make `deep-mode-run` warn `PARTIAL:0`. The test fixture hides this by writing `results`.

Reproducer: Persisted run shape is `{ mode:"deep", tiers:[...] }`; `checkDeepModeRun()` reads `results=[]`.

Recommendation: Accept `data.tiers ?? data.results`, require `mode === "deep"`, and scan all recent deep runs instead of only the latest file.

### F2 [P1]
File: `src/orchestrator.mjs:111`

What: `--setup`, `--projects`, `--accounts`, `--version`, and `--help` are parsed but mostly no-op.

Why: The CLI exits success without doing the requested command. Tests only cover `--status`.

Reproducer: `parseArgs()` recognizes these commands, but `orchestrate()` only handles `status`.

Recommendation: Wire each command or return explicit unsupported errors until implemented.

### F3 [P1]
File: `src/lib/exec.mjs:35`, `src/lib/config.mjs:160`

What: Project config env overrides can replace built-in routing env like `ANTHROPIC_BASE_URL`.

Why: A project `.vein.json` can redirect Claude traffic to an arbitrary gateway while inheriting the user’s auth environment. The test at `tests/lib/exec.test.mjs:43` codifies this behavior.

Reproducer: `{ env: { ANTHROPIC_BASE_URL: "http://attacker:9999" } }` wins over the CLIProxy URL.

Recommendation: Apply project env first, then protected launcher env, or deny launcher-owned keys.

### F4 [P1]
File: `tools/eval_gate.mjs:216`

What: `numPassedTests` and baseline `score` are not validated as finite numbers.

Why: A malformed runner result yields `score = NaN`; JSON history stores that as `null`, and future regression math becomes `NaN`, making `regressed` false.

Reproducer: Inject `testRunner: async () => ({ numTotalTests: 100 })`; the gate can pass and append a poisoned baseline.

Recommendation: Validate `numPassedTests`, `numTotalTests`, baseline `score`, and behavioral scores before comparison or append.

### F5 [P1]
File: `src/tiers/t6-codegraph.mjs:22`

What: GitNexus status/analyze runs in the launcher cwd, not `config.projectDir`.

Why: Deep checks for a named project can inspect or reindex `vein-launch` instead of the target repo.

Reproducer: Launch from `C:\SEA\src\vein-launch` with project `trading`; T6 calls `npx gitnexus@1.6.5 status` without `cwd`.

Recommendation: Pass `{ cwd: config.projectDir }` to all project-scoped GitNexus commands.

### F6 [P2]
File: `src/tiers/t5-drift.mjs:51`

What: Drift cache key ignores `~/.claude/.mcp.json` content.

Why: Changing MCP server versions can be hidden for 24 hours if pinned versions are unchanged. Tests explicitly assert fresh cache avoids reading `.mcp.json`.

Reproducer: Cache PASS, edit `.mcp.json` to `gitnexus@2.0.0`, rerun T5 inside TTL.

Recommendation: Include MCP config hash/mtime in the cache key or re-read config before trusting cache.

### F7 [P2]
File: `src/team.mjs:35`, `config/schema.json:82`

What: Team config field names drifted: schema allows `agents.team`/`members`, code expects `teamName`/`teammates`.

Why: Valid `.vein.json` team config produces `null`; tests use a shape the schema rejects.

Reproducer: `{ agents: { team: "alpha", members: ["dev"] } }` validates but `generateTeamConfig()` returns null.

Recommendation: Align schema and implementation, then add a config-loader integration test.

### F8 [P2]
File: `src/parallel.mjs:34`

What: Parallel spawning is both unwired and incompatible with the hardened `exec()` splitter.

Why: No CLI/schema path reaches it, and the built `wt ... "quoted path"` command is whitespace-split by `exec()`, breaking paths with spaces and quoted args.

Reproducer: `buildWtCommand({ cwd: "C:/My Project" })` returns a string that `exec()` splits into bad argv.

Recommendation: Use `execArgs("wt", [...])` and either wire `--parallel` or remove the dead surface.

### F9 [P2]
File: `src/setup/rtk.mjs:17`, `src/setup/mise-init.mjs:17`

What: Install commands require shell features but call `exec()` without `shellMode:true`.

Why: `exec()` intentionally does not interpret pipes/semicolons. RTK/mise install commands are therefore brittle or broken; tests mock the setup modules.

Reproducer: POSIX commands contain `| sh`; Windows commands contain PowerShell script strings.

Recommendation: Use `execArgs` with explicit PowerShell args on Windows and controlled `shellMode:true` only for POSIX pipe installers.

### F10 [P2]
File: `src/setup/first-time.mjs:303`

What: Once `install-json` exists, later successful setup steps are never persisted.

Why: A failed first run can write partial `setupSteps`; later reruns complete missing steps but skip rewriting `install.json`.

Reproducer: First run fails `vein-root-env` but writes install-json; second run succeeds, yet install-json remains stale.

Recommendation: Rewrite install.json whenever `completedNow` differs from `completedBefore`.

### F11 [P2]
File: `src/lib/sessions.mjs:63`

What: Session files are written directly to their final path and liveness is pid-only.

Why: Concurrent readers can see partial JSON, and PID reuse can keep stale sessions “active” indefinitely.

Reproducer: Seed a session file with the PID of any unrelated live process; `listSessions()` treats it as active.

Recommendation: Write temp + rename, and store/check process start time or a heartbeat.

### F12 [P2]
File: `tools/instrument-check.mjs:77`

What: `proc` target is interpolated into a Bash command without quoting.

Why: A diagnostic tool can execute unintended shell syntax from its own argument.

Reproducer: `node tools/instrument-check.mjs proc "node; echo injected"` changes the shell command.

Recommendation: Avoid shell pipelines for user input; use `execFile`/`spawn` argv or strictly quote/escape patterns.

END_OF_AUDIT_REPORT
