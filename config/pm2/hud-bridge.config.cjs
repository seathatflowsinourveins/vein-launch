/**
 * PM2 ecosystem config for the hud-bridge sidecar (SP2).
 *
 * Start with:
 *   pm2 start config/pm2/hud-bridge.config.cjs
 *
 * The process polls CLIProxy's management API every 30 s and writes
 * ~/.vein/hud/external-usage.json for claude-hud to consume.
 *
 * Environment:
 *   MANAGEMENT_PASSWORD  — CLIProxy management key (required if auth is on)
 *   CLIPROXY_PORT        — override CLIProxy port (default: 8317)
 *   VEIN_LAUNCH_ROOT     — repo root; defaults to the directory of this file's
 *                          package (two levels up from config/pm2/)
 */

const repoRoot = process.env.VEIN_LAUNCH_ROOT ?? require("node:path").join(__dirname, "..", "..");

module.exports = {
  apps: [
    {
      name: "hud-bridge",
      script: "tools/hud-bridge.mjs",
      interpreter: "node",
      interpreter_args: "--input-type=module",
      cwd: repoRoot,
      env: {
        MANAGEMENT_PASSWORD: process.env.MANAGEMENT_PASSWORD ?? "",
        CLIPROXY_PORT: process.env.CLIPROXY_PORT ?? "8317",
        NODE_ENV: "production",
      },
      // Restart policy
      restart_delay: 5_000,
      max_restarts: 10,
      autorestart: true,
      // Logging
      out_file: "~/.vein/logs/hud-bridge.out.log",
      error_file: "~/.vein/logs/hud-bridge.err.log",
      merge_logs: false,
      // PM2 instance settings
      instances: 1,
      exec_mode: "fork",
    },
  ],
};
