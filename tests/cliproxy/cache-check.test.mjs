/**
 * Tests for CLIProxy cache validation.
 * Mocks global fetch to stay fully unit-isolated.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateCache } from "../../src/cliproxy/cache-check.mjs";

/** Build a mock Response with the given cache token count. */
function mockResponse(cacheTokens) {
  return {
    ok: true,
    json: () => Promise.resolve({ usage: { cache_read_input_tokens: cacheTokens } }),
  };
}

describe("validateCache()", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Core result shape
  // -------------------------------------------------------------------------

  it("returns cacheWorking:true when second request has cache_read_input_tokens > 0", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockResolvedValueOnce(mockResponse(42));

    const result = await validateCache("http://localhost:9090");

    expect(result.cacheWorking).toBe(true);
  });

  it("returns cacheWorking:false when second request has 0 cache tokens", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockResolvedValueOnce(mockResponse(0));

    const result = await validateCache("http://localhost:9090");

    expect(result.cacheWorking).toBe(false);
  });

  it("returns cacheWorking:false when first request fetch throws", async () => {
    fetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await validateCache("http://localhost:9090");

    expect(result.cacheWorking).toBe(false);
  });

  it("returns cacheWorking:false when second request fetch throws", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockRejectedValueOnce(new Error("ETIMEDOUT"));

    const result = await validateCache("http://localhost:9090");

    expect(result.cacheWorking).toBe(false);
  });

  // -------------------------------------------------------------------------
  // firstRequest shape
  // -------------------------------------------------------------------------

  it("firstRequest.cacheTokens reflects the actual value from the first response", async () => {
    fetch.mockResolvedValueOnce(mockResponse(7)).mockResolvedValueOnce(mockResponse(99));

    const result = await validateCache("http://localhost:9090");

    expect(result.firstRequest.cacheTokens).toBe(7);
  });

  it("firstRequest.ok is true when the first response is ok", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockResolvedValueOnce(mockResponse(10));

    const result = await validateCache("http://localhost:9090");

    expect(result.firstRequest.ok).toBe(true);
  });

  it("firstRequest.ok is false when first request throws", async () => {
    fetch.mockRejectedValueOnce(new Error("network error"));

    const result = await validateCache("http://localhost:9090");

    expect(result.firstRequest.ok).toBe(false);
  });

  // -------------------------------------------------------------------------
  // secondRequest shape
  // -------------------------------------------------------------------------

  it("secondRequest.cacheTokens reflects the actual value from the second response", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockResolvedValueOnce(mockResponse(123));

    const result = await validateCache("http://localhost:9090");

    expect(result.secondRequest.cacheTokens).toBe(123);
  });

  it("secondRequest.ok is true when the second response is ok", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockResolvedValueOnce(mockResponse(55));

    const result = await validateCache("http://localhost:9090");

    expect(result.secondRequest.ok).toBe(true);
  });

  it("secondRequest.ok is false when second request throws", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockRejectedValueOnce(new Error("timeout"));

    const result = await validateCache("http://localhost:9090");

    expect(result.secondRequest.ok).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Message field
  // -------------------------------------------------------------------------

  it("message describes cache working when second request has cache tokens", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockResolvedValueOnce(mockResponse(88));

    const result = await validateCache("http://localhost:9090");

    expect(result.message).toMatch(/cache working/i);
    expect(result.message).toContain("88");
  });

  it("message states cache not working when second request has 0 tokens", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockResolvedValueOnce(mockResponse(0));

    const result = await validateCache("http://localhost:9090");

    expect(result.message).toMatch(/cache not working/i);
  });

  it("message includes error details when first request fails", async () => {
    fetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await validateCache("http://localhost:9090");

    expect(result.message).toMatch(/first request failed/i);
    expect(result.message).toContain("ECONNREFUSED");
  });

  it("message includes error details when second request fails", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockRejectedValueOnce(new Error("ETIMEDOUT"));

    const result = await validateCache("http://localhost:9090");

    expect(result.message).toMatch(/second request failed/i);
    expect(result.message).toContain("ETIMEDOUT");
  });

  // -------------------------------------------------------------------------
  // fetch call correctness
  // -------------------------------------------------------------------------

  it("calls fetch with the correct URL (baseUrl + /v1/messages)", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockResolvedValueOnce(mockResponse(1));

    await validateCache("http://localhost:9090");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:9090/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("calls fetch with correct Content-Type header", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockResolvedValueOnce(mockResponse(1));

    await validateCache("http://localhost:9090");

    const [, options] = fetch.mock.calls[0];
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("calls fetch with correct anthropic-version header", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockResolvedValueOnce(mockResponse(1));

    await validateCache("http://localhost:9090");

    const [, options] = fetch.mock.calls[0];
    expect(options.headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("sends POST method with JSON-serialized body", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockResolvedValueOnce(mockResponse(1));

    await validateCache("http://localhost:9090");

    const [, options] = fetch.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(typeof options.body).toBe("string");
    const parsed = JSON.parse(options.body);
    expect(parsed).toHaveProperty("model");
    expect(parsed).toHaveProperty("messages");
  });

  it("uses AbortSignal.timeout for request cancellation", async () => {
    const signals = [];
    fetch.mockImplementation((_url, opts) => {
      signals.push(opts.signal);
      return Promise.resolve(mockResponse(0));
    });

    await validateCache("http://localhost:9090");

    expect(signals).toHaveLength(2);
    for (const signal of signals) {
      expect(signal).toBeInstanceOf(AbortSignal);
    }
  });

  // -------------------------------------------------------------------------
  // Options
  // -------------------------------------------------------------------------

  it("uses custom payload when provided via options", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockResolvedValueOnce(mockResponse(5));

    const customPayload = {
      model: "claude-haiku-3-5-20241022",
      max_tokens: 1,
      messages: [{ role: "user", content: "custom probe" }],
    };

    await validateCache("http://localhost:9090", { payload: customPayload });

    const [, options] = fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.model).toBe("claude-haiku-3-5-20241022");
    expect(body.messages[0].content).toBe("custom probe");
  });

  it("makes exactly two fetch calls (one prime + one cache check)", async () => {
    fetch.mockResolvedValueOnce(mockResponse(0)).mockResolvedValueOnce(mockResponse(20));

    await validateCache("http://localhost:9090");

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("returns firstRequest from prior successful request when second request fails", async () => {
    fetch.mockResolvedValueOnce(mockResponse(3)).mockRejectedValueOnce(new Error("network drop"));

    const result = await validateCache("http://localhost:9090");

    expect(result.firstRequest.ok).toBe(true);
    expect(result.firstRequest.cacheTokens).toBe(3);
    expect(result.secondRequest.ok).toBe(false);
    expect(result.secondRequest.cacheTokens).toBe(0);
  });
});
