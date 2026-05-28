#!/usr/bin/env node
import { handleStop } from "./stop-handler.mjs";

let event = {};
try {
  event = JSON.parse(process.env.CLAUDE_HOOK_EVENT || "{}");
} catch (err) {
  process.stderr.write(`stop-handler-cli: invalid CLAUDE_HOOK_EVENT JSON (${err.message})\n`);
}

try {
  const result = await handleStop(event, { skipReview: !process.env.CODEX_STOP_REVIEW });
  if (result.blockers > 0) {
    process.stderr.write(`${result.message}\n`);
    process.exit(2);
  }
} catch (err) {
  process.stderr.write(`stop-handler-cli: handleStop threw (${err.message})\n`);
  process.exit(2);
}
