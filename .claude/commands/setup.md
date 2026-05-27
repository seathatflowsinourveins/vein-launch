description: Run vein-launch first-time setup wizard
allowed-tools:
  - Bash(*)
  - Read
  - Write
  - Edit
  - Glob

# /setup — First-Time Setup

Run the vein-launch setup wizard. This configures:
1. WSL2 + Docker Desktop
2. RTK (rtk init -g)
3. CLIProxy (Docker or PM2)
4. CLI tools via mise
5. Git config (SSH signing, autocrlf=false, rerere)
6. GitHub rulesets

## Execution Contract
Delegate to `node src/setup/index.mjs`. Report each step's pass/fail status.
