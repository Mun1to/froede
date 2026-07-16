// End-to-end check for the static-html target: spawns the real companion
// against examples/static-site, connects like the extension would, edits a
// paragraph, verifies the file on disk, then restores it.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..");
const exampleDir = path.join(repo, "examples", "static-site");
const cli = path.join(repo, "packages", "companion", "dist", "cli.js");
const PORT = 4599;
const TOKEN = "e2e" + "0".repeat(45);

if (typeof WebSocket === "undefined") {
  console.error("e2e needs Node >= 22 (native WebSocket)");
  process.exit(1);
}

const targetFile = path.join(exampleDir, "index.html");
const original = readFileSync(targetFile, "utf8");
writeFileSync(path.join(exampleDir, ".froede-token"), TOKEN + "\n");

const child = spawn(process.execPath, [cli, "--port", String(PORT)], {
  cwd: exampleDir,
  stdio: ["ignore", "pipe", "inherit"],
});

const fail = (msg) => {
  console.error("FAIL (static):", msg);
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

// Reject check: wrong token must not connect.
const badWs = new WebSocket(`ws://127.0.0.1:${PORT}/?token=wrong`);
const badRejected = await new Promise((resolve) => {
  badWs.onopen = () => resolve(false);
  badWs.onerror = () => resolve(true);
  badWs.onclose = () => resolve(true);
});
if (!badRejected) fail("connection with a bad token was NOT rejected");

const NEW_TEXT = "This text was edited by the froede e2e script.";
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
      target: {
        kind: "static-html",
        urlPath: "/",
        // html>body(1) > main(1) > p(1)
        domPath: [1, 1, 1],
      },
      previousText:
        "Click any text on this page with froede and edit it in place.",
      newText: NEW_TEXT,
    }),
  );
}).catch((err) => fail(err.message));

if (!response.ok) fail("companion returned error: " + response.error);

const written = readFileSync(targetFile, "utf8");
if (!written.includes(NEW_TEXT)) fail("new text not found in index.html");
if (written.includes("Click any text on this page")) {
  fail("old text still present in index.html");
}
const diffLines = written
  .split("\n")
  .filter((line, i) => line !== original.split("\n")[i]);
if (diffLines.length !== 1) {
  fail(`expected exactly 1 changed line, got ${diffLines.length}`);
}

// Escaping check: HTML-sensitive characters must be escaped in the file.
const resp2 = await new Promise((resolve) => {
  ws.onmessage = (event) => resolve(JSON.parse(String(event.data)));
  ws.send(
    JSON.stringify({
      type: "write-text",
      requestId: "e2e-2",
      target: { kind: "static-html", urlPath: "/", domPath: [1, 1, 1] },
      previousText: NEW_TEXT,
      newText: "a < b & c > d",
    }),
  );
});
if (!resp2.ok) fail("escaping edit failed: " + resp2.error);
const written2 = readFileSync(targetFile, "utf8");
if (!written2.includes("a &lt; b &amp; c &gt; d")) {
  fail("HTML special characters were not escaped: " + written2.match(/a .*? d/)?.[0]);
}

// Traversal check: an urlPath escaping the root must be rejected.
const resp3 = await new Promise((resolve) => {
  ws.onmessage = (event) => resolve(JSON.parse(String(event.data)));
  ws.send(
    JSON.stringify({
      type: "write-text",
      requestId: "e2e-3",
      target: { kind: "static-html", urlPath: "/../../secret.html", domPath: [0] },
      previousText: "x",
      newText: "y",
    }),
  );
});
if (resp3.ok) fail("path traversal was NOT rejected");

ws.close();
child.kill();
writeFileSync(targetFile, original);
console.log("PASS (static): edit + escaping + bad-token reject + traversal reject");
