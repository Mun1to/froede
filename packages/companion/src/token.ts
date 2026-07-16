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

/** Constant-time comparison that does not leak length differences. */
export function tokensMatch(expected: string, received: string): boolean {
  const a = crypto.createHash("sha256").update(expected).digest();
  const b = crypto.createHash("sha256").update(received).digest();
  return crypto.timingSafeEqual(a, b);
}
