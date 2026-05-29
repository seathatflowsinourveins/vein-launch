#!/usr/bin/env node
/**
 * CLI entry for the TaskCompleted hook. Thin wrapper around handleTaskCompleted.
 * Exits 2 only on a genuine, gate-detected test/lint failure (teammate must fix).
 * Fails OPEN (exit 0) on any handler/parse error so the loop is never trapped.
 */
import { handleTaskCompleted } from "./task-completed.mjs";

let event = {};
try {
  event = JSON.parse(process.env.CLAUDE_HOOK_EVENT || "{}");
} catch (err) {
  process.stderr.write(`task-completed-cli: invalid CLAUDE_HOOK_EVENT JSON (${err.message})\n`);
}

try {
  const result = await handleTaskCompleted(event);
  if (!result.passed) {
    process.stderr.write(`${result.message}\n`);
    process.exit(2);
  }
} catch (err) {
  // Fail open at the CLI boundary too — a broken gate must not block task completion.
  process.stderr.write(`task-completed-cli: handler threw, failing open — ${err.message}\n`);
  process.exit(0);
}
