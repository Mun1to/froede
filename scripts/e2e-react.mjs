// End-to-end check for the react target: spawns the real companion against
// examples/react-vite-app, edits the <h1> text in App.tsx at its real
// source location, verifies the file, then restores it.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..");
const exampleDir = path.join(repo, "examples", "react-vite-app");
const cli = path.join(repo, "packages", "companion", "dist", "cli.js");
const PORT = 4598;
const TOKEN = "e2e" + "1".repeat(45);

if (typeof WebSocket === "undefined") {
  console.error("e2e needs Node >= 22 (native WebSocket)");
  process.exit(1);
}

const targetFile = path.join(exampleDir, "src", "App.tsx");
const original = readFileSync(targetFile, "utf8");
writeFileSync(path.join(exampleDir, ".froede-token"), TOKEN + "\n");

// Locate <h1> the same way @babel/parser reports it: 1-based line,
// 0-based column of the element's `<`.
const idx = original.indexOf("<h1>");
if (idx < 0) {
  console.error("FAIL (react): fixture does not contain <h1>");
  process.exit(1);
}
const before = original.slice(0, idx);
const line = before.split("\n").length;
const column = idx - (before.lastIndexOf("\n") + 1);

const child = spawn(process.execPath, [cli, "--port", String(PORT)], {
  cwd: exampleDir,
  stdio: ["ignore", "pipe", "inherit"],
});

const fail = (msg) => {
  console.error("FAIL (react):", msg);
  child.kill();
  writeFileSync(targetFile, original);
  process.exit(1);
};

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("companion did not start")), 8000);
  child.stdout.on("data", (chunk) => {
    if (String(chunk).includes("listening")) {
      clearTimeout(timer);
      resolve();
    }
  });
  child.on("exit", (code) => reject(new Error("companion exited early: " + code)));
}).catch((err) => fail(err.message));

const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?token=${TOKEN}`);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = () => reject(new Error("could not connect"));
}).catch((err) => fail(err.message));

// Ping handshake first.
const pong = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("no pong")), 8000);
  ws.onmessage = (event) => {
    clearTimeout(timer);
    resolve(JSON.parse(String(event.data)));
  };
  ws.send(JSON.stringify({ type: "ping", requestId: "e2e-0", protocolVersion: 1 }));
}).catch((err) => fail(err.message));
if (pong.type !== "pong" || pong.protocolVersion !== 1) {
  fail("bad pong: " + JSON.stringify(pong));
}

const NEW_TEXT = "Edited by froede e2e";
const response = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("no write-result")), 8000);
  ws.onmessage = (event) => {
    clearTimeout(timer);
    resolve(JSON.parse(String(event.data)));
  };
  ws.send(
    JSON.stringify({
      type: "write-text",
      requestId: "e2e-1",
      target: { kind: "react", file: "src/App.tsx", line, column },
      previousText: "Hola froede",
      newText: NEW_TEXT,
    }),
  );
}).catch((err) => fail(err.message));

if (!response.ok) fail("companion returned error: " + response.error);

const written = readFileSync(targetFile, "utf8");
if (!written.includes(`<h1>${NEW_TEXT}</h1>`)) {
  fail("new text not found in App.tsx: " + written.match(/<h1>.*<\/h1>/)?.[0]);
}

// Mismatch check: stale previousText must be rejected, file untouched.
const resp2 = await new Promise((resolve) => {
  ws.onmessage = (event) => resolve(JSON.parse(String(event.data)));
  ws.send(
    JSON.stringify({
      type: "write-text",
      requestId: "e2e-2",
      target: { kind: "react", file: "src/App.tsx", line, column },
      previousText: "Hola froede",
      newText: "should never land",
    }),
  );
});
if (resp2.ok) fail("stale previousText was NOT rejected");
if (readFileSync(targetFile, "utf8").includes("should never land")) {
  fail("file was written despite the mismatch");
}

// JSX-sensitive characters must be wrapped as an expression.
const resp3 = await new Promise((resolve) => {
  ws.onmessage = (event) => resolve(JSON.parse(String(event.data)));
  ws.send(
    JSON.stringify({
      type: "write-text",
      requestId: "e2e-3",
      target: { kind: "react", file: "src/App.tsx", line, column },
      previousText: NEW_TEXT,
      newText: "a < b { c }",
    }),
  );
});
if (!resp3.ok) fail("jsx-escaping edit failed: " + resp3.error);
const written3 = readFileSync(targetFile, "utf8");
if (!written3.includes(`<h1>{"a < b { c }"}</h1>`)) {
  fail("JSX special characters were not wrapped: " + written3.match(/<h1>.*<\/h1>/)?.[0]);
}

ws.close();
child.kill();
writeFileSync(targetFile, original);
console.log("PASS (react): ping + edit + mismatch reject + jsx escaping");
