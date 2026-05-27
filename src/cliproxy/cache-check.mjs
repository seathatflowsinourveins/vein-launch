/**
 * CLIProxy cache validation.
 * Sends two identical requests through the proxy; the second should have
 * cache_read_input_tokens > 0, proving the prompt cache is working.
 */

/** @type {object} */
const DEFAULT_PAYLOAD = {
  model: "claude-sonnet-4-5-20250514",
  max_tokens: 1,
  messages: [{ role: "user", content: "Cache validation probe — respond with a single period." }],
};

/**
 * @typedef {{ ok: boolean, cacheTokens: number }} RequestResult
 * @typedef {{
 *   cacheWorking: boolean,
 *   firstRequest: RequestResult,
 *   secondRequest: RequestResult,
 *   message: string
 * }} CacheValidationResult
 */

/**
 * Validates that CLIProxy prompt caching is working.
 * @param {string} baseUrl - Proxy base URL, e.g. "http://localhost:9090".
 * @param {{ timeout?: number, payload?: object }} [options]
 * @returns {Promise<CacheValidationResult>}
 */
export async function validateCache(baseUrl, options = {}) {
  const { timeout = 10000, payload = DEFAULT_PAYLOAD } = options;
  const url = `${baseUrl}/v1/messages`;
  const headers = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };

  let first;

  try {
    const res1 = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });
    const body1 = await res1.json();
    first = { ok: res1.ok, cacheTokens: body1?.usage?.cache_read_input_tokens ?? 0 };
  } catch (err) {
    return {
      cacheWorking: false,
      firstRequest: { ok: false, cacheTokens: 0 },
      secondRequest: { ok: false, cacheTokens: 0 },
      message: `First request failed: ${err.message}`,
    };
  }

  try {
    const res2 = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });
    const body2 = await res2.json();
    const second = { ok: res2.ok, cacheTokens: body2?.usage?.cache_read_input_tokens ?? 0 };
    const cacheWorking = second.cacheTokens > 0;

    return {
      cacheWorking,
      firstRequest: first,
      secondRequest: second,
      message: cacheWorking
        ? `Cache working — ${second.cacheTokens} tokens cached on second request`
        : "Cache not working — second request had 0 cache_read_input_tokens",
    };
  } catch (err) {
    return {
      cacheWorking: false,
      firstRequest: first,
      secondRequest: { ok: false, cacheTokens: 0 },
      message: `Second request failed: ${err.message}`,
    };
  }
}
