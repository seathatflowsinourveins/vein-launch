/**
 * Hook handler for SessionStart event.
 * Logs session start metadata and optionally loads context.
 */

/**
 * @typedef {Object} SessionStartResult
 * @property {boolean} logged
 * @property {string} message
 */

/**
 * Handle a SessionStart event by logging session metadata.
 * @param {unknown} _event
 * @param {Object} options
 * @param {string} [options.projectName="unknown"]
 * @param {string} [options.mode="fast"]
 * @returns {Promise<SessionStartResult>}
 */
export async function handleSessionStart(_event, options = {}) {
  const { projectName = "unknown", mode = "fast" } = options;
  const timestamp = new Date().toISOString();
  return {
    logged: true,
    message: `Session started: project=${projectName}, mode=${mode}, time=${timestamp}`,
  };
}
