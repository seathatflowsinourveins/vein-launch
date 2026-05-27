/**
 * Tests for src/hooks/stop-handler.mjs
 *
 * runCodexReview is mocked so no real Codex CLI or network call is made.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock codex-review before importing the module under test
vi.mock("../../src/quality/codex-review.mjs", () => ({
  runCodexReview: vi.fn(),
}));

import { handleStop } from "../../src/hooks/stop-handler.mjs";
import { runCodexReview } from "../../src/quality/codex-review.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReviewResult({ blockers = 0, warnings = 0 } = {}) {
  return {
    ok: blockers === 0,
    findings: [],
    blockers,
    warnings,
    duration: 150,
  };
}

// ---------------------------------------------------------------------------
// handleStop
// ---------------------------------------------------------------------------

describe("handleStop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs review and returns reviewed:true on success", async () => {
    runCodexReview.mockResolvedValue(makeReviewResult());
    const result = await handleStop({});
    expect(result.reviewed).toBe(true);
  });

  it("returns the blockers count from the review result", async () => {
    runCodexReview.mockResolvedValue(makeReviewResult({ blockers: 3, warnings: 1 }));
    const result = await handleStop({});
    expect(result.blockers).toBe(3);
  });

  it("message describes clean state when no blockers", async () => {
    runCodexReview.mockResolvedValue(makeReviewResult({ blockers: 0, warnings: 2 }));
    const result = await handleStop({});
    expect(result.message).toContain("clean");
    expect(result.message).toContain("2");
  });

  it("message describes blocker state when blockers found", async () => {
    runCodexReview.mockResolvedValue(makeReviewResult({ blockers: 2 }));
    const result = await handleStop({});
    expect(result.message).toContain("2 blocker");
    expect(result.message).toContain("fix before continuing");
  });

  it("skips review and returns reviewed:false when skipReview is true", async () => {
    const result = await handleStop({}, { skipReview: true });
    expect(result.reviewed).toBe(false);
    expect(result.blockers).toBe(0);
    expect(result.message).toBe("review skipped");
    expect(runCodexReview).not.toHaveBeenCalled();
  });

  it("passes model and effort options to runCodexReview", async () => {
    runCodexReview.mockResolvedValue(makeReviewResult());
    await handleStop({}, { model: "gpt-4o", effort: "low" });
    expect(runCodexReview).toHaveBeenCalledWith({ model: "gpt-4o", effort: "low" });
  });

  it("uses default model gpt-5.5 and effort xhigh when no options given", async () => {
    runCodexReview.mockResolvedValue(makeReviewResult());
    await handleStop({});
    expect(runCodexReview).toHaveBeenCalledWith({ model: "gpt-5.5", effort: "xhigh" });
  });

  it("handles review throwing an error gracefully", async () => {
    runCodexReview.mockRejectedValue(new Error("codex binary not found"));
    const result = await handleStop({});
    expect(result.reviewed).toBe(false);
    expect(result.blockers).toBe(0);
    expect(result.message).toContain("Review failed");
    expect(result.message).toContain("codex binary not found");
  });
});
