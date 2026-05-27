# Install Provenance Log

Every external dependency install is logged here. Newest entries at bottom.
Do not edit existing entries — append only.

---

## 2026-05-27 — vein-launch v1.0.0 baseline SOTA stack

- **Components:** AO 0.9.2, CCW 7.3.14, Codex 0.134.0, RTK 0.42.0, CLIProxy 7.1.24, GitNexus 1.6.5, PM2 7.0.1
- **Installed by:** vein-launch Wave 9 install sequence
- **Verification:** all CLIs responded to --version
- **Notes:** CLIProxy authenticated with 5 OAuth accounts (4 Claude + 1 Codex Pro)

---

## 2026-05-27 — Wave 10.5-C npm package audit + manifest smoke test

### npm pack --dry-run (--ignore-scripts, v1.1.0)

- **Total files:** 59
- **Package size:** 35.6 kB (unpacked: 125.6 kB)
- **docs/sota-installed-manifest.md included:** YES (2.1 kB)
- **shasum:** 54de900f2e40c1e0a326bc649d881c4fc337bdee
- **integrity:** sha512-Q+m6mTiF1oLwN[...]Ama9bfV1gmF8A==

Key files in package: `bin/vein.ps1`, `bin/vein.cmd`, `src/**/*.mjs`,
`config/**`, `docs/sota-installed-manifest.md`, `README.md`, `LICENSE`

Note: `--ignore-scripts` used because the `prepare` hook (`npx lefthook install`)
fails in a git worktree where `core.hooksPath` is set to the main repo's `.git/hooks`.
This does not affect the published package contents.

### --manifest smoke test

```
node src/cli.mjs --manifest | grep -q "AO (Agent Orchestrator)" && echo PASS || echo FAIL
```

Result: **PASS** — manifest table prints to stdout with all 7 SOTA components.
