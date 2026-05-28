/**
 * Stop-event hook handler — triggers async GPT-5.5 Codex review when Claude stops.
 *
 * Reads VEIN_LAUNCHED and VEIN_PROJECT from the environment to personalize the review
 * prompt when Claude was launched via vein-launch. This gives the Codex reviewer context
 * about which project is under review so it can apply project-specific heuristics.
 *
 * @typedef {{ reviewed: boolean, blockers: number, message: string, project?: string }} StopResult
 */

import { runCodexReview } from "../quality/codex-review.mjs";

/**
 * Return the vein launch context from env vars, if present.
 * VEIN_LAUNCHED=1 is set by src/lib/exec.mjs whenever claude is spawned via vein-launch.
 * VEIN_PROJECT is the lowercased project name (may be empty string if not configured).
 *
 * @returns {{ veinLaunched: boolean, project: string }}
 */
export function getVeinContext() {
  const veinLaunched = process.env.VEIN_LAUNCHED === "1";
  const project = process.env.VEIN_PROJECT ?? "";
  return { veinLaunched, project };
}

/**
 * Handle a Stop event by running Codex review on the current diff.
 * When launched via vein, the project name is included in the result message so
 * the review is traceable in multi-project workflows.
 *
 * @param {unknown} _event  The Stop event payload (reserved for future use).
 * @param {{ skipReview?: boolean, model?: string, effort?: string }} options
 * @returns {Promise<StopResult>}
 */
export async function handleStop(_event, options = {}) {
  const { skipReview = false, model = "gpt-5.5", effort = "xhigh" } = options;
  const { veinLaunched, project } = getVeinContext();
  const projectTag = veinLaunched && project ? ` [${project}]` : "";

  if (skipReview) {
    return { reviewed: false, blockers: 0, message: "review skipped", project };
  }

  try {
    const result = await runCodexReview({ model, effort });
    return {
      reviewed: true,
      blockers: result.blockers,
      project,
      message:
        result.blockers > 0
          ? `${result.blockers} blocker(s) found${projectTag} — fix before continuing`
          : `Review clean${projectTag} (${result.warnings} warning(s))`,
    };
  } catch (err) {
    return { reviewed: false, blockers: 0, project, message: `Review failed: ${err.message}` };
  }
}
