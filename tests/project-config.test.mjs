/**
 * Tests for src/project-config.mjs
 * Covers: listProjects, addProject, removeProject, resolveProject, getProjectsPath
 *
 * All filesystem and os.homedir() calls are mocked so tests never touch disk.
 */

import { join, sep } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/mock/home"),
}));

const fs = await import("node:fs");
const { listProjects, addProject, removeProject, resolveProject, getProjectsPath } = await import(
  "../src/project-config.mjs"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setRegistry(obj) {
  fs.existsSync.mockImplementation((p) => p.endsWith("projects.json") || p.endsWith(".vein"));
  fs.readFileSync.mockReturnValue(JSON.stringify(obj));
}

function setNoRegistry() {
  fs.existsSync.mockReturnValue(false);
  fs.readFileSync.mockReturnValue("{}");
}

// ---------------------------------------------------------------------------
// getProjectsPath
// ---------------------------------------------------------------------------

describe("getProjectsPath", () => {
  it("returns the correct path under ~/.vein", () => {
    // Use join() so the expectation matches platform-specific separators.
    const expected = join("/mock/home", ".vein", "projects.json");
    expect(getProjectsPath()).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// listProjects
// ---------------------------------------------------------------------------

describe("listProjects", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty object when file does not exist", () => {
    setNoRegistry();
    expect(listProjects()).toEqual({});
  });

  it("returns parsed registry when file exists", () => {
    setRegistry({ trading: "/projects/trading" });
    expect(listProjects()).toEqual({ trading: "/projects/trading" });
  });

  it("returns empty object when file contains invalid JSON", () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue("NOT_JSON");
    expect(listProjects()).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// addProject
// ---------------------------------------------------------------------------

describe("addProject", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds a new project to an empty registry", () => {
    setNoRegistry();
    const result = addProject("trading", "/projects/trading");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("trading");
    expect(fs.writeFileSync).toHaveBeenCalledOnce();
  });

  it("writes the updated registry to disk", () => {
    setNoRegistry();
    addProject("foo", "/projects/foo");
    const written = fs.writeFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.foo).toBe("/projects/foo");
  });

  it("rejects a duplicate name", () => {
    setRegistry({ trading: "/projects/trading" });
    const result = addProject("trading", "/projects/other");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("already exists");
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("rejects an invalid name with special characters", () => {
    setNoRegistry();
    const result = addProject("bad name!", "/projects/bad");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Invalid project name");
  });

  it("rejects a name with path traversal characters", () => {
    setNoRegistry();
    const result = addProject("../etc", "/projects/bad");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Invalid project name");
  });

  it("rejects an empty path", () => {
    setNoRegistry();
    const result = addProject("good-name", "");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Path is required");
  });

  it("creates ~/.vein/ directory if it does not exist", () => {
    // existsSync returns false for both the projects.json and the dir
    fs.existsSync.mockReturnValue(false);
    addProject("myproj", "/some/path");
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining(".vein"),
      expect.objectContaining({ recursive: true }),
    );
  });

  it("does not call mkdirSync when ~/.vein/ already exists", () => {
    // existsSync: projects.json absent, but dir present — mimic by returning
    // false for projects.json path and true for the dir path
    fs.existsSync.mockImplementation((p) => !p.endsWith("projects.json"));
    fs.readFileSync.mockReturnValue("{}");
    addProject("newproj", "/some/path");
    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// removeProject
// ---------------------------------------------------------------------------

describe("removeProject", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes an existing project", () => {
    setRegistry({ trading: "/projects/trading" });
    const result = removeProject("trading");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("trading");
  });

  it("calls writeFileSync with the updated registry after removal", () => {
    setRegistry({ trading: "/projects/trading", other: "/projects/other" });
    removeProject("trading");
    const written = fs.writeFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed).not.toHaveProperty("trading");
    expect(parsed).toHaveProperty("other");
  });

  it("returns error when project name is not found", () => {
    setRegistry({});
    const result = removeProject("nonexistent");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("not found");
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// resolveProject
// ---------------------------------------------------------------------------

describe("resolveProject", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the canonicalized registered path for a known alias", () => {
    setRegistry({ trading: "/projects/trading" });
    const result = resolveProject("trading");
    expect(result).toBeTruthy();
    expect(result.endsWith("projects" + sep + "trading")).toBe(true);
  });

  it("returns the canonicalized path if it exists on disk (not in registry)", () => {
    setRegistry({});
    fs.existsSync.mockImplementation((p) => String(p).includes("actual"));
    const result = resolveProject("/actual/path/on/disk");
    expect(result).toBeTruthy();
    expect(result.endsWith("disk")).toBe(true);
  });

  it("returns null for an unknown name that does not exist on disk", () => {
    setRegistry({});
    fs.existsSync.mockReturnValue(false);
    expect(resolveProject("ghost")).toBeNull();
  });

  it("returns null for undefined input", () => {
    setRegistry({});
    expect(resolveProject(undefined)).toBeNull();
  });

  it("returns null for empty string input", () => {
    setRegistry({});
    expect(resolveProject("")).toBeNull();
  });
});
