// End-to-end check for the static-html target: spawns the real companion
// against examples/static-site, connects like the extension would, edits
// text and style, verifies the file on disk, then restores it.
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

function send(payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no response: " + payload.type)), 8000);
    ws.onmessage = (event) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(event.data)));
    };
    ws.send(JSON.stringify(payload));
  });
}

// Reject check: wrong token must not connect.
const badWs = new WebSocket(`ws://127.0.0.1:${PORT}/?token=wrong`);
const badRejected = await new Promise((resolve) => {
  badWs.onopen = () => resolve(false);
  badWs.onerror = () => resolve(true);
  badWs.onclose = () => resolve(true);
});
if (!badRejected) fail("connection with a bad token was NOT rejected");

// --- text edit ---------------------------------------------------------

const NEW_TEXT = "This text was edited by the froede e2e script.";
const response = await send({
  type: "write-text",
  requestId: "e2e-1",
  // html>body(1) > main(1) > p(1)
  target: { kind: "static-html", urlPath: "/", domPath: [1, 1, 1] },
  previousText: "Click any text on this page with froede and edit it in place.",
  newText: NEW_TEXT,
}).catch((err) => fail(err.message));

if (!response.ok) fail("companion returned error: " + response.error);

let written = readFileSync(targetFile, "utf8");
if (!written.includes(NEW_TEXT)) fail("new text not found in index.html");
if (written.includes("Click any text on this page")) {
  fail("old text still present in index.html");
}
const diffLines = written
  .split("\n")
  .filter((line, i) => line !== original.split("\n")[i]);
if (diffLines.length !== 1) {
  fail(`expected exactly 1 changed line after the text edit, got ${diffLines.length}`);
}

// Escaping check: HTML-sensitive characters must be escaped in the file.
const resp2 = await send({
  type: "write-text",
  requestId: "e2e-2",
  target: { kind: "static-html", urlPath: "/", domPath: [1, 1, 1] },
  previousText: NEW_TEXT,
  newText: "a < b & c > d",
});
if (!resp2.ok) fail("escaping edit failed: " + resp2.error);
written = readFileSync(targetFile, "utf8");
if (!written.includes("a &lt; b &amp; c &gt; d")) {
  fail("HTML special characters were not escaped: " + written.match(/a .*? d/)?.[0]);
}

// Traversal check: an urlPath escaping the root must be rejected.
const resp3 = await send({
  type: "write-text",
  requestId: "e2e-3",
  target: { kind: "static-html", urlPath: "/../../secret.html", domPath: [0] },
  previousText: "x",
  newText: "y",
});
if (resp3.ok) fail("path traversal was NOT rejected");

// --- style edit: <h1> has no attributes at all -> must insert style="..." --

const resp4 = await send({
  type: "write-style",
  requestId: "e2e-4",
  target: { kind: "static-html", urlPath: "/", domPath: [1, 1, 0] }, // html>body(1)>main(1)>h1(0)
  previousStyle: { width: "" },
  style: { width: "300px" },
});
if (!resp4.ok) fail("style insert (no existing attrs) failed: " + resp4.error);
written = readFileSync(targetFile, "utf8");
if (!written.includes('<h1 style="width: 300px;">')) {
  fail("style attribute not inserted correctly on <h1>: " + written.match(/<h1[^>]*>/)?.[0]);
}

// --- style edit: <span class="brand"> already has an attribute -> the new
// style="..." must be inserted BEFORE it without disturbing it.

const resp5 = await send({
  type: "write-style",
  requestId: "e2e-5",
  target: { kind: "static-html", urlPath: "/", domPath: [1, 0, 0] }, // html>body(1)>header(0)>span(0)
  previousStyle: { color: "" },
  style: { color: "#ff0000" },
});
if (!resp5.ok) fail("style insert (existing attrs) failed: " + resp5.error);
written = readFileSync(targetFile, "utf8");
if (!written.includes('<span style="color: #ff0000;" class="brand">')) {
  fail(
    "style attribute not inserted before the existing class attr: " +
      written.match(/<span[^>]*>/)?.[0],
  );
}

// A second edit on <h1> must PATCH the existing declaration (update width,
// add color), not clobber it.
const resp6 = await send({
  type: "write-style",
  requestId: "e2e-6",
  target: { kind: "static-html", urlPath: "/", domPath: [1, 1, 0] },
  previousStyle: { width: "300px", color: "" },
  style: { width: "320px", color: "#00ff00" },
});
if (!resp6.ok) fail("style patch failed: " + resp6.error);
written = readFileSync(targetFile, "utf8");
if (!written.includes('style="width: 320px; color: #00ff00;"')) {
  fail("style attribute not patched correctly: " + written.match(/<h1[^>]*>/)?.[0]);
}

// Drag-to-move: a translate() transform must pass the allowlist and merge in.
const respT = await send({
  type: "write-style",
  requestId: "e2e-t",
  target: { kind: "static-html", urlPath: "/", domPath: [1, 1, 0] },
  previousStyle: { transform: "" },
  style: { transform: "translate(24px, -8px)" },
});
if (!respT.ok) fail("transform (move) failed: " + respT.error);
written = readFileSync(targetFile, "utf8");
if (!written.includes("transform: translate(24px, -8px)")) {
  fail("transform not written to <h1>: " + written.match(/<h1[^>]*>/)?.[0]);
}

// Mismatch check for style: stale previousStyle must be rejected.
const resp7 = await send({
  type: "write-style",
  requestId: "e2e-7",
  target: { kind: "static-html", urlPath: "/", domPath: [1, 1, 0] },
  previousStyle: { width: "300px" }, // stale - actual current width is 320px
  style: { width: "999px" },
});
if (resp7.ok) fail("stale previousStyle was NOT rejected");
if (readFileSync(targetFile, "utf8").includes("999px")) {
  fail("file was written despite the style mismatch");
}

// --- attr edits ---------------------------------------------------------

// Insert title on the bare <h1>.
const respA1 = await send({
  type: "write-attr",
  requestId: "e2e-a1",
  target: { kind: "static-html", urlPath: "/", domPath: [1, 1, 0] },
  name: "title",
  previousValue: "",
  newValue: 'The "main" heading & more',
});
if (!respA1.ok) fail("attr insert failed: " + respA1.error);
written = readFileSync(targetFile, "utf8");
if (!written.includes('title="The &quot;main&quot; heading &amp; more"')) {
  fail("title not inserted/escaped: " + written.match(/<h1[^>]*>/)?.[0]);
}

// Patch it.
const respA2 = await send({
  type: "write-attr",
  requestId: "e2e-a2",
  target: { kind: "static-html", urlPath: "/", domPath: [1, 1, 0] },
  name: "title",
  previousValue: 'The "main" heading & more',
  newValue: "Simply the heading",
});
if (!respA2.ok) fail("attr patch failed: " + respA2.error);
written = readFileSync(targetFile, "utf8");
if (!written.includes('title="Simply the heading"')) {
  fail("title not patched: " + written.match(/<h1[^>]*>/)?.[0]);
}

// javascript: URLs rejected at the protocol layer (element irrelevant).
const respA3 = await send({
  type: "write-attr",
  requestId: "e2e-a3",
  target: { kind: "static-html", urlPath: "/", domPath: [1, 1, 0] },
  name: "href",
  previousValue: "",
  newValue: "  JAVASCRIPT:alert(1)",
});
if (respA3.ok) fail("javascript: URL was NOT rejected");

// --- delete element -----------------------------------------------------

// Mismatch guard: a wrong previousTag must be rejected (nothing deleted).
const respD0 = await send({
  type: "delete-element",
  requestId: "e2e-d0",
  target: { kind: "static-html", urlPath: "/", domPath: [1, 1, 2] }, // the <section>
  previousTag: "p", // wrong - it is a <section>
});
if (respD0.ok) fail("delete with a mismatched previousTag was NOT rejected");

// Delete the <section>: it and its contents vanish, siblings stay, and no
// blank indented line is left behind.
const respD1 = await send({
  type: "delete-element",
  requestId: "e2e-d1",
  target: { kind: "static-html", urlPath: "/", domPath: [1, 1, 2] },
  previousTag: "section",
});
if (!respD1.ok) fail("delete failed: " + respD1.error);
written = readFileSync(targetFile, "utf8");
if (written.includes("<section>") || written.includes("<h2>About</h2>")) {
  fail("deleted <section> still present in index.html");
}
if (!written.match(/<h1[^>]*>/) || !written.includes("<footer>")) {
  fail("delete removed more than the target element");
}
if (written.split("\n").some((l) => /^\s+$/.test(l))) {
  fail("delete left a blank indented line behind");
}

ws.close();
child.kill();
writeFileSync(targetFile, original);
console.log(
  "PASS (static): text edit + escaping + traversal reject + bad-token reject + style insert (bare/with-attrs) + style patch + transform (move) + style mismatch reject + attr insert/patch + js-url reject + delete (mismatch reject + clean removal)",
);
