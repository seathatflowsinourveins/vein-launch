/**
 * manifest.mjs — reads and prints the SOTA installed manifest.
 *
 * readManifest(path?)   — returns the manifest as a string
 * printManifest(opts?)  — writes it to an output stream, returns exit code
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Read the SOTA manifest file.
 *
 * @param {string} [manifestPath] - Explicit path; defaults to docs/sota-installed-manifest.md
 * @returns {Promise<string>}
 */
export async function readManifest(manifestPath) {
  const path = manifestPath ?? resolveDefaultPath();
  return readFile(path, "utf8");
}

/**
 * Print the SOTA manifest to an output stream.
 *
 * @param {{ out?: NodeJS.WritableStream, manifestPath?: string }} [opts]
 * @returns {Promise<0|1>}
 */
export async function printManifest({ out = process.stdout, manifestPath } = {}) {
  try {
    const content = await readManifest(manifestPath);
    out.write(content);
    return 0;
  } catch (err) {
    process.stderr.write(`[vein] manifest unavailable: ${err.code ?? "read failed"}\n`);
    return 1;
  }
}

function resolveDefaultPath() {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "docs", "sota-installed-manifest.md");
}
