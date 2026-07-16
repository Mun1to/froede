#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import { COMPANION_VERSION, startServer } from "./server.js";
import { loadOrCreateToken } from "./token.js";

export const DEFAULT_PORT = 4519;

const { values } = parseArgs({
  options: {
    port: { type: "string", short: "p" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`froede companion v${COMPANION_VERSION}

Run this inside the project you want to edit. The current directory
becomes the project root: froede will never write outside of it.

Usage:
  froede [--port ${DEFAULT_PORT}]
`);
  process.exit(0);
}

const port = values.port ? Number(values.port) : DEFAULT_PORT;
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`invalid port: ${values.port}`);
  process.exit(1);
}

const root = path.resolve(process.cwd());

const { token, created } = await loadOrCreateToken(root);
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

console.log(`froede companion v${COMPANION_VERSION}
  project root: ${root}
  listening:    ws://127.0.0.1:${port}
  token:        ${token}

  Open the froede extension popup and paste the port and token above.${
    created
      ? "\n  Created .froede-token in the project root - add it to your .gitignore."
      : ""
  }
`);
