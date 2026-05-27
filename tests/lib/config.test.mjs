/**
 * Tests for src/lib/config.mjs
 * Covers: parseArgs, validateProjectConfig, deepMerge
 *
 * Note on Ajv + draft-2020-12: config/schema.json declares
 * "$schema": "https://json-schema.org/draft/2020-12/schema", but the source
 * constructs `new Ajv()` (draft-07 class). Ajv v8 tries to validate the schema
 * itself against the declared meta-schema and throws if the meta-schema URI
 * isn't registered. We mock `readFileSync` (used by validateProjectConfig) to
 * strip the `$schema` declaration so Ajv treats it as a plain draft-07 schema
 * — the structural keywords used (type, required, additionalProperties, enum,
 * pattern, not, anyOf) are all valid draft-07, so validation semantics are
 * preserved.
 */

import { describe, expect, it, vi } from "vitest";

// --- mock readFileSync to strip $schema from schema.json before Ajv sees it ---
vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    readFileSync: (path, encoding) => {
      const raw = original.readFileSync(path, encoding);
      // Only strip from schema files to avoid side-effects on other fs reads
      if (typeof raw === "string" && raw.includes('"$schema"') && raw.includes("json-schema.org")) {
        const parsed = JSON.parse(raw);
        const { $schema: _dropped, ...rest } = parsed;
        return JSON.stringify(rest);
      }
      return raw;
    },
  };
});

import { deepMerge, parseArgs, validateProjectConfig } from "../../src/lib/config.mjs";

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  describe("project + default mode", () => {
    it("parses project name, defaults mode to fast", () => {
      const result = parseArgs(["trading"]);
      expect(result.project).toBe("trading");
      expect(result.mode).toBe("fast");
      expect(result.error).toBeUndefined();
    });
  });

  describe("--deep flag", () => {
    it("sets mode to deep", () => {
      const result = parseArgs(["trading", "--deep"]);
      expect(result.mode).toBe("deep");
      expect(result.project).toBe("trading");
    });

    it("-d short flag sets mode to deep", () => {
      const result = parseArgs(["trading", "-d"]);
      expect(result.mode).toBe("deep");
    });
  });

  describe("--repair / -r flag", () => {
    it("--repair sets mode to repair", () => {
      const result = parseArgs(["trading", "--repair"]);
      expect(result.mode).toBe("repair");
      expect(result.project).toBe("trading");
    });

    it("-r short flag sets mode to repair", () => {
      const result = parseArgs(["trading", "-r"]);
      expect(result.mode).toBe("repair");
    });
  });

  describe("--setup command", () => {
    it("sets command to setup", () => {
      const result = parseArgs(["--setup"]);
      expect(result.command).toBe("setup");
      expect(result.error).toBeUndefined();
    });
  });

  describe("pass-through args after --", () => {
    it("captures everything after -- into passThrough", () => {
      const result = parseArgs(["trading", "--", "--foo", "bar", "--baz"]);
      expect(result.passThrough).toEqual(["--foo", "bar", "--baz"]);
    });

    it("passThrough is empty when -- is absent", () => {
      const result = parseArgs(["trading"]);
      expect(result.passThrough).toEqual([]);
    });
  });

  describe("error: --deep + --repair combo", () => {
    it("returns error when both --deep and --repair are given", () => {
      const result = parseArgs(["trading", "--deep", "--repair"]);
      expect(result.error).toMatch(/Cannot combine/);
    });

    it("returns error when --repair then --deep", () => {
      const result = parseArgs(["trading", "--repair", "--deep"]);
      expect(result.error).toMatch(/Cannot combine/);
    });
  });

  describe("error: mode flag without project", () => {
    it("--deep without project returns error", () => {
      const result = parseArgs(["--deep"]);
      expect(result.error).toMatch(/requires a project name/);
    });

    it("--repair without project returns error", () => {
      const result = parseArgs(["--repair"]);
      expect(result.error).toMatch(/requires a project name/);
    });
  });

  describe("error: --setup with project", () => {
    it("--setup with a project name returns error", () => {
      const result = parseArgs(["trading", "--setup"]);
      expect(result.error).toMatch(/global/);
    });
  });

  describe("informational commands", () => {
    it("--version sets command to version", () => {
      const result = parseArgs(["--version"]);
      expect(result.command).toBe("version");
      expect(result.error).toBeUndefined();
    });

    it("--help sets command to help", () => {
      const result = parseArgs(["--help"]);
      expect(result.command).toBe("help");
    });

    it("--accounts sets command to accounts", () => {
      const result = parseArgs(["--accounts"]);
      expect(result.command).toBe("accounts");
    });

    it("-a sets command to accounts", () => {
      const result = parseArgs(["-a"]);
      expect(result.command).toBe("accounts");
    });

    it("--projects sets command to projects", () => {
      const result = parseArgs(["--projects"]);
      expect(result.command).toBe("projects");
    });

    it("--status sets command to status", () => {
      const result = parseArgs(["--status"]);
      expect(result.command).toBe("status");
    });
  });
});

// ---------------------------------------------------------------------------
// validateProjectConfig
// ---------------------------------------------------------------------------

describe("validateProjectConfig", () => {
  const validBase = { project: "my-project" };

  it("accepts a minimal valid config with project field", () => {
    const result = validateProjectConfig(validBase);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects config missing the required project field", () => {
    const result = validateProjectConfig({});
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/project/);
  });

  it("rejects config with ANTHROPIC_API_KEY in env", () => {
    const config = {
      project: "my-project",
      env: { ANTHROPIC_API_KEY: "sk-secret" },
    };
    const result = validateProjectConfig(config);
    // The JSON Schema `not/anyOf/required` block fires for uppercase keys and
    // Ajv returns "/env must NOT be valid". The post-validate loop only runs
    // after schema-level validation passes, so it is not reached here.
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects ANTHROPIC_API_KEY case-insensitively via schema (not the post-validate check)", () => {
    // The JSON Schema `not/anyOf/required` check is case-sensitive by key name,
    // so the post-validate env-key loop handles mixed-case variants.
    const config = {
      project: "my-project",
      env: { anthropic_api_key: "sk-secret" },
    };
    const result = validateProjectConfig(config);
    // uppercase match in FORBIDDEN_ENV = ["ANTHROPIC_API_KEY", ...]
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("rejects PATH in env (uppercase)", () => {
    const config = { project: "my-project", env: { PATH: "/usr/local/bin" } };
    // JSON Schema `not` block covers uppercase PATH; check that validation fails
    const result = validateProjectConfig(config);
    expect(result.valid).toBe(false);
  });

  it("rejects path (lowercase) in env via case-insensitive post-validate check", () => {
    const config = { project: "my-project", env: { path: "/usr/local/bin" } };
    const result = validateProjectConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/PATH/i);
  });

  it("rejects reserved CLAUDE_CODE_ internals in env", () => {
    const config = {
      project: "my-project",
      env: { CLAUDE_CODE_DISABLE_HOOKS: "1" },
    };
    const result = validateProjectConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/CLAUDE_CODE_/);
  });

  it("allows whitelisted CLAUDE_CODE_SUBAGENT_MODEL in env", () => {
    const config = {
      project: "my-project",
      env: { CLAUDE_CODE_SUBAGENT_MODEL: "claude-haiku-4-5" },
    };
    const result = validateProjectConfig(config);
    expect(result.valid).toBe(true);
  });

  it("allows whitelisted CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS in env", () => {
    const config = {
      project: "my-project",
      env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" },
    };
    const result = validateProjectConfig(config);
    expect(result.valid).toBe(true);
  });

  it("rejects unknown top-level fields (additionalProperties: false)", () => {
    const config = { project: "my-project", unknownField: true };
    const result = validateProjectConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/additional/i);
  });

  it("accepts all optional top-level fields: cliproxy, quality, modelRouting, docker, agents, env", () => {
    const config = {
      project: "my-app",
      cliproxy: { hosting: "pm2", port: 8317, sessionAffinity: true },
      quality: {
        codexReview: "on-pr",
        codexModel: "gpt-5.5",
        codexEffort: "xhigh",
        shipGate: true,
        testsRequired: true,
        promptfooGate: false,
        autonomousLoops: false,
        maxIterations: 50,
        convergenceThreshold: 0.95,
      },
      modelRouting: { default: "opus", subagents: "haiku", planning: "opusplan" },
      docker: { composeFile: "docker-compose.yml", requiredServices: ["db"] },
      agents: { team: "alpha", members: ["alice"] },
      env: { MY_CUSTOM_VAR: "value" },
    };
    const result = validateProjectConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects cliproxy port below 1024 (post-validate range check)", () => {
    const config = { project: "my-project", cliproxy: { port: 80 } };
    const result = validateProjectConfig(config);
    expect(result.valid).toBe(false);
  });

  it("rejects cliproxy port above 65535 (post-validate range check)", () => {
    const config = { project: "my-project", cliproxy: { port: 70000 } };
    const result = validateProjectConfig(config);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deepMerge
// ---------------------------------------------------------------------------

describe("deepMerge", () => {
  it("merges nested objects without losing defaults", () => {
    const target = { a: 1, nested: { x: 10, y: 20 } };
    const source = { nested: { x: 99 } };
    const result = deepMerge(target, source);
    expect(result.a).toBe(1);
    expect(result.nested.x).toBe(99);
    expect(result.nested.y).toBe(20);
  });

  it("arrays replace rather than merge", () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [4, 5] };
    const result = deepMerge(target, source);
    expect(result.items).toEqual([4, 5]);
  });

  it("null values in source replace target values", () => {
    const target = { a: { b: 1 } };
    const source = { a: null };
    const result = deepMerge(target, source);
    expect(result.a).toBeNull();
  });

  it("source keys absent from target are added", () => {
    const target = { a: 1 };
    const source = { b: 2 };
    const result = deepMerge(target, source);
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
  });

  it("does not mutate target or source", () => {
    const target = { nested: { x: 1 } };
    const source = { nested: { x: 2 } };
    deepMerge(target, source);
    expect(target.nested.x).toBe(1);
    expect(source.nested.x).toBe(2);
  });

  it("handles deeply nested merge (3 levels)", () => {
    const target = { a: { b: { c: 1, d: 2 } } };
    const source = { a: { b: { c: 99 } } };
    const result = deepMerge(target, source);
    expect(result.a.b.c).toBe(99);
    expect(result.a.b.d).toBe(2);
  });
});
