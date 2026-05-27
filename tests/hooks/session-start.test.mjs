/**
 * Tests for session-start.mjs — SessionStart event hook.
 */

import { describe, expect, it } from "vitest";
import { handleSessionStart } from "../../src/hooks/session-start.mjs";

describe("handleSessionStart", () => {
  it("returns logged=true", async () => {
    const result = await handleSessionStart({});
    expect(result.logged).toBe(true);
  });

  it("message includes the project name", async () => {
    const result = await handleSessionStart({}, { projectName: "vein-launch" });
    expect(result.message).toContain("project=vein-launch");
  });

  it("message includes the mode", async () => {
    const result = await handleSessionStart({}, { mode: "full" });
    expect(result.message).toContain("mode=full");
  });

  it("uses defaults when no options provided", async () => {
    const result = await handleSessionStart({});
    expect(result.message).toContain("project=unknown");
    expect(result.message).toContain("mode=fast");
  });
});
