#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import { runInit } from "./init.js";
import { COMPANION_VERSION, startServer } from "./server.js";
import { ensureTokenIgnored, findGitRoot, loadOrCreateToken } from "./token.js";

export const DEFAULT_PORT = 4519;

const { values, positionals } = parseArgs({
  options: {
    port: { type: "string", short: "p" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

const root = path.resolve(process.cwd());

if (values.help) {
  console.log(`froede companion v${COMPANION_VERSION}

Run this inside the project you want to edit. The current directory
becomes the project root: froede will never write outside of it.

Usage:
  froede               start the companion here
  froede init          wire this project up (vite plugin + gitignore)
  froede [--port ${DEFAULT_PORT}]
`);
  process.exit(0);
}

if (positionals[0] === "init") {
  await runInit(root);
  process.exit(0);
}
if (positionals.length > 0) {
  console.error(`unknown command: ${positionals[0]} (try --help)`);
  process.exit(1);
}

const port = values.port ? Number(values.port) : DEFAULT_PORT;
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`invalid port: ${values.port}`);
  process.exit(1);
}

const { token, created } = await loadOrCreateToken(root);
const ignored = await ensureTokenIgnored(root);
// Shown explicitly: froede's undo is `git diff`, so the user needs to know
// whether that safety net is actually there (it lives above the cwd in a
// monorepo, which froede used to miss entirely).
const gitRoot = await findGitRoot(root);
try {
  await startServer({
    root,
    port,
    token,
    log: (line) => console.log(`[froede] ${line}`),
  });
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
    console.error(
      `port ${port} is already in use - is another companion running? (use --port to pick another)`,
    );
    process.exit(1);
  }
  throw err;
}

const tokenNote = created ? "\n  Created .froede-token in the project root." : "";
const ignoreNote =
  ignored === "added" || ignored === "created"
    ? "\n  Added .froede-token to this project's .gitignore (it is a local secret)."
    : ignored === "no-git"
      ? "\n  No git repo detected - keep .froede-token out of version control if you add one."
      : "";

console.log(`froede companion v${COMPANION_VERSION}
  project root: ${root}
  git repo:     ${gitRoot ?? "none found - git diff is froede's undo, consider git init"}
  listening:    ws://127.0.0.1:${port}
  token:        ${token}

  Open the froede extension popup and paste the port and token above.${tokenNote}${ignoreNote}
`);
