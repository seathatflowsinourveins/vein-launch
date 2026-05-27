import { describe, expect, it } from "vitest";
import { exec } from "../../src/lib/shell.mjs";

describe("exec", () => {
  it("returns ok:true and matching stdout for node --version", async () => {
    const result = await exec("node --version");
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toMatch(/v\d+/);
  });

  it("returns ok:false with exitCode 1 for process.exit(1)", async () => {
    const result = await exec('node -e "process.exit(1)"');
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
  });

  it("returns timedOut:true for a command that exceeds timeout", async () => {
    const result = await exec('node -e "setTimeout(()=>{},5000)"', { timeout: 200 });
    expect(result.timedOut).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("returns ok:true for a successful command", async () => {
    const result = await exec('node -e "process.exit(0)"');
    expect(result.ok).toBe(true);
  });
});
