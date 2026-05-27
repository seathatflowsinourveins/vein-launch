#!/usr/bin/env node
import { handleTeammateIdle } from "./teammate-idle.mjs";

const event = JSON.parse(process.env.CLAUDE_HOOK_EVENT || "{}");
const result = await handleTeammateIdle(event);
if (!result.passed) {
  process.stderr.write(`${result.message}\n`);
  process.exit(2);
}
