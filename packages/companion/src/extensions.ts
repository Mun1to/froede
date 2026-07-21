import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";

/** Chrome extension IDs are exactly 32 characters from a-p. */
const EXTENSION_ID = /^[a-p]{32}$/;
const EXTENSION_ORIGIN_PREFIX = "chrome-extension://";

const CONFIG_DIR = path.join(os.homedir(), ".froede");
export const APPROVED_FILE = path.join(CONFIG_DIR, "allowed-extensions.json");

export function isExtensionId(id: string): boolean {
  return EXTENSION_ID.test(id);
}

/** The extension id inside a `chrome-extension://<id>` Origin, if it is one. */
export function extensionIdFromOrigin(origin: string | undefined): string | null {
  if (typeof origin !== "string" || !origin.startsWith(EXTENSION_ORIGIN_PREFIX)) {
    return null;
  }
  const id = origin.slice(EXTENSION_ORIGIN_PREFIX.length);
  return isExtensionId(id) ? id : null;
}

/**
 * Extension ids the user approved interactively on a previous run. Kept in
 * the home directory, not the project: an unpacked extension keeps its id
 * across every project you open, so approving it once is enough.
 */
export async function loadApprovedExtensions(): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(APPROVED_FILE, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && isExtensionId(id));
  } catch {
    return [];
  }
}

export async function approveExtension(id: string): Promise<void> {
  if (!isExtensionId(id)) throw new Error(`not an extension id: ${id}`);
  const current = await loadApprovedExtensions();
  if (current.includes(id)) return;
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(
    APPROVED_FILE,
    JSON.stringify([...current, id], null, 2) + "\n",
    { encoding: "utf8", mode: 0o600 },
  );
}

const DEFAULT_PORT = 4519;

/**
 * The exact command that authorises this extension for one run. Must carry
 * the CURRENT port when it isn't the default - otherwise a user who started
 * on a non-default port (e.g. because 4519 was already taken) copy-pastes a
 * command that reconnects to the wrong companion, or fails with EADDRINUSE.
 */
export function pairingCommand(id: string, port: number): string {
  const portFlag = port !== DEFAULT_PORT ? ` --port ${port}` : "";
  return process.platform === "win32"
    ? `$env:FROEDE_EXTENSION_ID="${id}"; npx froede${portFlag}`
    : `FROEDE_EXTENSION_ID=${id} npx froede${portFlag}`;
}

/**
 * Interactive pairing. A silent rejection while the user stares at a popup is
 * the worst possible outcome, so the companion says exactly what happened,
 * prints a ready-to-paste command, and (on a real terminal) offers to trust
 * the extension permanently.
 *
 * Only ever asks once per id per run: the extension retries on its own, and a
 * question re-printed on every retry would be unreadable.
 */
export function createPairingPrompt(options: {
  log: (line: string) => void;
  onApproved: (id: string) => void;
  /** The port THIS companion is actually listening on. */
  port: number;
  /** Overridable for tests; defaults to the real stdin/stdout. */
  input?: NodeJS.ReadableStream & { isTTY?: boolean };
  output?: NodeJS.WritableStream;
}): (id: string) => Promise<void> {
  const asked = new Set<string>();
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;

  return async function offerPairing(id: string): Promise<void> {
    if (asked.has(id)) return;
    asked.add(id);

    options.log(`rejected connection: extension ${id} is not authorised`);
    output.write(
      `\n  The froede extension ${id} tried to connect but is not authorised.\n` +
        `  That usually means it was loaded unpacked, so Chrome gave it its own id.\n\n` +
        `  Authorise it for one run with:\n\n    ${pairingCommand(id, options.port)}\n\n`,
    );

    if (!input.isTTY) {
      output.write(`  (no interactive terminal: approve it with the command above)\n\n`);
      return;
    }

    const rl = readline.createInterface({ input, output });
    try {
      const answer = await rl.question(`  Authorise extension ${id} permanently? [s/N] `);
      if (!/^\s*(s|si|sí|y|yes)\s*$/i.test(answer)) {
        output.write(`  Not authorised. froede will keep rejecting it.\n\n`);
        return;
      }
      await approveExtension(id);
      options.onApproved(id);
      output.write(
        `  Authorised. Saved to ${APPROVED_FILE}\n` +
          `  Press "Save and test" in the popup again.\n\n`,
      );
    } catch {
      output.write(`  Could not save the approval; use the command above instead.\n\n`);
    } finally {
      rl.close();
    }
  };
}
