/**
 * Config loader — reads .vein.json + default.json, validates against schema.
 * Implements the documented validation pipeline from agent_docs/security-model.md.
 */

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import Ajv from "ajv";

const DEFAULTS_PATH = new URL("../../config/default.json", import.meta.url);
const SCHEMA_PATH = new URL("../../config/schema.json", import.meta.url);

const FORBIDDEN_ENV = ["ANTHROPIC_API_KEY", "PATH", "HOME", "USERPROFILE"];
const VALID_MODES = ["fast", "deep", "repair"];

export async function loadConfig(args) {
  const defaults = JSON.parse(await readFile(DEFAULTS_PATH, "utf-8"));
  const parsed = parseArgs(args);

  if (parsed.error) {
    return Object.freeze({ ...defaults, mode: "fast", args: parsed, _configError: parsed.error });
  }
  if (parsed.command) {
    return Object.freeze({ ...defaults, mode: "fast", args: parsed });
  }

  const projectDir = resolveProject(parsed.project);
  const projectConfig = await loadProjectConfig(projectDir);
  const mode = parsed.mode ?? projectConfig?.mode?.default ?? "fast";

  const merged = deepMerge(defaults, projectConfig ?? {});

  return Object.freeze({
    ...merged,
    mode,
    projectDir,
    args: parsed,
  });
}

export function parseArgs(args) {
  const result = { project: null, mode: null, passThrough: [], command: null };
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === "--setup") {
      result.command = "setup";
      i++;
      continue;
    }
    if (arg === "--status") {
      result.command = "status";
      i++;
      continue;
    }
    if (arg === "--projects") {
      result.command = "projects";
      i++;
      continue;
    }
    if (arg === "--accounts" || arg === "-a") {
      result.command = "accounts";
      i++;
      continue;
    }
    if (arg === "--version") {
      result.command = "version";
      i++;
      continue;
    }
    if (arg === "--help") {
      result.command = "help";
      i++;
      continue;
    }

    if (arg === "--deep" || arg === "-d") {
      if (result.mode && result.mode !== "deep") {
        return { ...result, error: "Cannot combine --deep with --repair" };
      }
      result.mode = "deep";
      i++;
      continue;
    }
    if (arg === "--repair" || arg === "-r") {
      if (result.mode && result.mode !== "repair") {
        return { ...result, error: "Cannot combine --repair with --deep" };
      }
      result.mode = "repair";
      i++;
      continue;
    }

    if (arg.startsWith("--mode=")) {
      const mode = arg.slice(7);
      if (!VALID_MODES.includes(mode)) {
        return { ...result, error: `Invalid mode: ${mode}. Valid: ${VALID_MODES.join(", ")}` };
      }
      result.mode = mode;
      i++;
      continue;
    }

    if (arg === "--") {
      result.passThrough = args.slice(i + 1);
      break;
    }

    if (!arg.startsWith("-") && !result.project) {
      result.project = arg;
    }

    i++;
  }

  if (result.command && result.project) {
    if (result.command === "setup") {
      return { ...result, error: "--setup is global, not per-project" };
    }
  }

  if (result.mode && !result.project && !result.command) {
    return { ...result, error: `--${result.mode} requires a project name` };
  }

  if (!result.mode) result.mode = "fast";
  return result;
}

export function resolveProject(name) {
  if (!name) return process.cwd();
  const candidates = [resolve(`C:/SEA/src/${name}`), resolve(process.cwd(), name)];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

export function validateProjectConfig(config) {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);
  const valid = validate(config);

  if (!valid) {
    return { valid: false, errors: validate.errors.map((e) => `${e.instancePath} ${e.message}`) };
  }

  if (config.env) {
    for (const key of Object.keys(config.env)) {
      const upper = key.toUpperCase();
      if (FORBIDDEN_ENV.includes(upper)) {
        return {
          valid: false,
          errors: [`env.${key} is forbidden in .vein.json (case-insensitive match: ${upper})`],
        };
      }
      if (
        upper.startsWith("CLAUDE_CODE_") &&
        !["CLAUDE_CODE_SUBAGENT_MODEL", "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"].includes(upper)
      ) {
        return { valid: false, errors: [`env.${key} is a reserved CLAUDE_CODE_ internal`] };
      }
    }
  }

  if (config.cliproxy?.port !== undefined) {
    const port = config.cliproxy.port;
    if (port < 1024 || port > 65535) {
      return { valid: false, errors: [`cliproxy.port must be 1024-65535, got ${port}`] };
    }
  }

  return { valid: true, errors: [] };
}

const MAX_CONFIG_SIZE = 1024 * 1024; // 1 MB

async function loadProjectConfig(projectDir) {
  if (!projectDir) return null;
  const configPath = join(projectDir, ".vein.json");
  if (!existsSync(configPath)) return null;

  const fstat = lstatSync(configPath);
  if (fstat.isSymbolicLink()) {
    throw new Error(`.vein.json is a symlink — refusing to follow (security policy)`);
  }
  const fileSize = (await stat(configPath)).size;
  if (fileSize > MAX_CONFIG_SIZE) {
    throw new Error(`.vein.json exceeds 1 MB size limit (${fileSize} bytes)`);
  }

  const raw = JSON.parse(await readFile(configPath, "utf-8"));
  const validation = validateProjectConfig(raw);
  if (!validation.valid) {
    throw new Error(`.vein.json validation failed: ${validation.errors.join(", ")}`);
  }

  return deepFreeze(raw);
}

function deepFreeze(obj) {
  Object.freeze(obj);
  for (const val of Object.values(obj)) {
    if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export { deepMerge };
