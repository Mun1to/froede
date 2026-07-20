import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const TOKEN_FILE = ".froede-token";

/**
 * Loads the pairing token from .froede-token in the project root, creating
 * it on first run. Persisting it means restarting the companion does not
 * force re-pairing the extension; the file is a local secret and must be
 * gitignored (the CLI reminds the user).
 */
export async function loadOrCreateToken(root: string): Promise<{
  token: string;
  created: boolean;
}> {
  const file = path.join(root, TOKEN_FILE);
  try {
    const existing = (await fs.readFile(file, "utf8")).trim();
    if (/^[a-f0-9]{32,}$/i.test(existing)) {
      return { token: existing, created: false };
    }
  } catch {
    // fall through and create
  }
  const token = crypto.randomBytes(24).toString("hex");
  await fs.writeFile(file, token + "\n", { encoding: "utf8", mode: 0o600 });
  return { token, created: true };
}

/**
 * Walks up from `start` looking for a `.git` entry, the way git itself
 * resolves a repository. Checking only the starting directory reports "no git
 * repo" for every monorepo whose site lives in a subfolder - and since froede's
 * documented undo IS `git diff`, that wrongly tells the user they have no
 * safety net. `.git` is a directory in a normal clone but a FILE in worktrees
 * and submodules, so any entry counts.
 */
export async function findGitRoot(start: string): Promise<string | null> {
  let dir = path.resolve(start);
  for (;;) {
    try {
      await fs.stat(path.join(dir, ".git"));
      return dir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }
}

/** Constant-time comparison that does not leak length differences. */
export function tokensMatch(expected: string, received: string): boolean {
  const a = crypto.createHash("sha256").update(expected).digest();
  const b = crypto.createHash("sha256").update(received).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Makes sure .froede-token is gitignored in the project. The token is a
 * local secret; relying on every user remembering to add it by hand is
 * how secrets end up committed. Returns what happened so the caller can
 * log it honestly.
 */
export async function ensureTokenIgnored(
  root: string,
): Promise<"already" | "added" | "created" | "no-git"> {
  if ((await findGitRoot(root)) === null) return "no-git";
  const gitignore = path.join(root, ".gitignore");
  let content = "";
  try {
    content = await fs.readFile(gitignore, "utf8");
  } catch {
    await fs.writeFile(gitignore, TOKEN_FILE + "\n", "utf8");
    return "created";
  }
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  if (lines.includes(TOKEN_FILE)) return "already";
  const sep = content.endsWith("\n") || content === "" ? "" : "\n";
  await fs.appendFile(gitignore, `${sep}${TOKEN_FILE}\n`, "utf8");
  return "added";
}
