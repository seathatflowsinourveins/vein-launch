#!/usr/bin/env node
import { handleStop } from "./stop-handler.mjs";

const event = JSON.parse(process.env.CLAUDE_HOOK_EVENT || "{}");
const result = await handleStop(event, { skipReview: !process.env.CODEX_STOP_REVIEW });
if (result.blockers > 0) {
  process.stderr.write(`${result.message}\n`);
  process.exit(2);
}
