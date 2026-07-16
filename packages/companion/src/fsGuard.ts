import { promises as fs } from "node:fs";
import path from "node:path";
import { FroedeError } from "./errors.js";

/**
 * Resolves a relative path against the project root and guarantees the
 * result stays inside it. Uses realpath on both sides so symlinks cannot
 * escape the root, and path.relative (never naive string prefixing) for
 * the containment check.
 */
export async function resolveInsideRoot(
  root: string,
  candidate: string,
): Promise<string> {
  if (candidate.includes("\0")) {
    throw new FroedeError("invalid path");
  }
  const rootReal = await fs.realpath(root);
  const abs = path.resolve(rootReal, candidate);

  let real: string;
  try {
    real = await fs.realpath(abs);
  } catch {
    throw new FroedeError("file not found inside the project root");
  }

  const rel = path.relative(rootReal, real);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new FroedeError("path is outside the project root");
  }
  return real;
}
