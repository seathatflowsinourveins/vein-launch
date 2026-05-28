#!/usr/bin/env node
import { handleTeammateIdle } from "./teammate-idle.mjs";

let event = {};
try {
  event = JSON.parse(process.env.CLAUDE_HOOK_EVENT || "{}");
} catch (err) {
  process.stderr.write(`teammate-idle-cli: invalid CLAUDE_HOOK_EVENT JSON (${err.message})\n`);
}

try {
  const result = await handleTeammateIdle(event);
  if (!result.passed) {
    process.stderr.write(`${result.message}\n`);
    process.exit(2);
  }
} catch (err) {
  process.stderr.write(`teammate-idle-cli: handleTeammateIdle threw (${err.message})\n`);
  process.exit(2);
}
