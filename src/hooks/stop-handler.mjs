/**
 * Stop-event hook handler — triggers async GPT-5.5 Codex review when Claude stops.
 *
 * @typedef {{ reviewed: boolean, blockers: number, message: string }} StopResult
 */

import { runCodexReview } from "../quality/codex-review.mjs";

/**
 * Handle a Stop event by running Codex review on the current diff.
 *
 * @param {unknown} _event  The Stop event payload (reserved for future use).
 * @param {{ skipReview?: boolean, model?: string, effort?: string }} options
 * @returns {Promise<StopResult>}
 */
export async function handleStop(_event, options = {}) {
  const { skipReview = false, model = "gpt-5.5", effort = "xhigh" } = options;

  if (skipReview) {
    return { reviewed: false, blockers: 0, message: "review skipped" };
  }

  try {
    const result = await runCodexReview({ model, effort });
    return {
      reviewed: true,
      blockers: result.blockers,
      message:
        result.blockers > 0
          ? `${result.blockers} blocker(s) found — fix before continuing`
          : `Review clean (${result.warnings} warning(s))`,
    };
  } catch (err) {
    return { reviewed: false, blockers: 0, message: `Review failed: ${err.message}` };
  }
}
