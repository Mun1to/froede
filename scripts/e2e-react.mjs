// End-to-end check for the react target: spawns the real companion against
// examples/react-vite-app, edits the <h1> text and style in App.tsx at its
// real source location, verifies the file, then restores it.
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
// 0-based column of the element's `<`. Read its CURRENT text instead of
// hardcoding it, so this script keeps working whatever App.tsx currently
// says (e.g. after someone edited the example into a portfolio page).
const idx = original.indexOf("<h1>");
if (idx < 0) {
  console.error("FAIL (react): fixture does not contain a plain <h1>text</h1>");
  process.exit(1);
}
const h1Match = original.slice(idx).match(/^<h1>([^<{]*)<\/h1>/);
if (!h1Match) {
  console.error("FAIL (react): <h1> is not a plain-text leaf");
  process.exit(1);
}
const originalH1Text = h1Match[1];
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

// Ping handshake first.
const pong = await send({ type: "ping", requestId: "e2e-0", protocolVersion: 1 }).catch((err) =>
  fail(err.message),
);
if (pong.type !== "pong" || pong.protocolVersion !== 1) {
  fail("bad pong: " + JSON.stringify(pong));
}

// --- text edit -------------------------------------------------------------

const NEW_TEXT = "Edited by froede e2e";
const response = await send({
  type: "write-text",
  requestId: "e2e-1",
  target: { kind: "react", file: "src/App.tsx", line, column },
  previousText: originalH1Text,
  newText: NEW_TEXT,
}).catch((err) => fail(err.message));

if (!response.ok) fail("companion returned error: " + response.error);

let written = readFileSync(targetFile, "utf8");
if (!written.includes(`<h1>${NEW_TEXT}</h1>`)) {
  fail("new text not found in App.tsx: " + written.match(/<h1>.*<\/h1>/)?.[0]);
}

// Mismatch check: stale previousText must be rejected, file untouched.
const resp2 = await send({
  type: "write-text",
  requestId: "e2e-2",
  target: { kind: "react", file: "src/App.tsx", line, column },
  previousText: originalH1Text, // stale - current text is now NEW_TEXT
  newText: "should never land",
});
if (resp2.ok) fail("stale previousText was NOT rejected");
if (readFileSync(targetFile, "utf8").includes("should never land")) {
  fail("file was written despite the mismatch");
}

// JSX-sensitive characters must be wrapped as an expression.
const resp3 = await send({
  type: "write-text",
  requestId: "e2e-3",
  target: { kind: "react", file: "src/App.tsx", line, column },
  previousText: NEW_TEXT,
  newText: "a < b { c }",
});
if (!resp3.ok) fail("jsx-escaping edit failed: " + resp3.error);
written = readFileSync(targetFile, "utf8");
if (!written.includes(`<h1>{"a < b { c }"}</h1>`)) {
  fail("JSX special characters were not wrapped: " + written.match(/<h1>.*<\/h1>/)?.[0]);
}

// --- style edit: h1 has no style attribute yet, so this must INSERT one ----

const resp4 = await send({
  type: "write-style",
  requestId: "e2e-4",
  target: { kind: "react", file: "src/App.tsx", line, column },
  previousStyle: { width: "" },
  style: { width: "300px" },
});
if (!resp4.ok) fail("style insert failed: " + resp4.error);
written = readFileSync(targetFile, "utf8");
if (!written.includes(`<h1 style={{ width: "300px" }}>`)) {
  fail("style attribute not inserted correctly: " + written.match(/<h1[^>]*>/)?.[0]);
}

// A second edit must PATCH the existing object (update width, add color),
// preserving the property already there.
const resp5 = await send({
  type: "write-style",
  requestId: "e2e-5",
  target: { kind: "react", file: "src/App.tsx", line, column },
  previousStyle: { width: "300px", color: "" },
  style: { width: "320px", color: "#ff0000" },
});
if (!resp5.ok) fail("style patch failed: " + resp5.error);
written = readFileSync(targetFile, "utf8");
if (!written.includes(`width: "320px"`) || !written.includes(`color: "#ff0000"`)) {
  fail("style object not patched correctly: " + written.match(/<h1[^>]*>/)?.[0]);
}

// Drag-to-move: a translate() transform must pass the allowlist and land in
// the style object as a plain string literal.
const respT = await send({
  type: "write-style",
  requestId: "e2e-t",
  target: { kind: "react", file: "src/App.tsx", line, column },
  previousStyle: { transform: "" },
  style: { transform: "translate(24px, -8px)" },
});
if (!respT.ok) fail("transform (move) failed: " + respT.error);
written = readFileSync(targetFile, "utf8");
if (!written.includes(`transform: "translate(24px, -8px)"`)) {
  fail("transform not written to <h1>: " + written.match(/<h1[^>]*>/)?.[0]);
}

// maxWidth (the fix for CSS classes capping an inline width/height) must
// round-trip through the allowlist and land as a real value, not "none".
const respMax = await send({
  type: "write-style",
  requestId: "e2e-max",
  target: { kind: "react", file: "src/App.tsx", line, column },
  previousStyle: { maxWidth: "" },
  style: { maxWidth: "none" },
});
if (!respMax.ok) fail("maxWidth insert failed: " + respMax.error);
written = readFileSync(targetFile, "utf8");
if (!written.includes(`maxWidth: "none"`)) {
  fail("maxWidth not written correctly: " + written.match(/<h1[^>]*>/)?.[0]);
}

// Mismatch check for style: stale previousStyle must be rejected.
const resp6 = await send({
  type: "write-style",
  requestId: "e2e-6",
  target: { kind: "react", file: "src/App.tsx", line, column },
  previousStyle: { width: "300px" }, // stale - actual current width is 320px
  style: { width: "999px" },
});
if (resp6.ok) fail("stale previousStyle was NOT rejected");
if (readFileSync(targetFile, "utf8").includes("999px")) {
  fail("file was written despite the style mismatch");
}

// --- attr edits: the <a href="#work"> link ------------------------------

const aIdx = original.indexOf('<a className="btn primary" href="#work">');
if (aIdx < 0) fail("fixture does not contain the expected <a> element");
const aBefore = original.slice(0, aIdx);
const aLine = aBefore.split("\n").length;
const aColumn = aIdx - (aBefore.lastIndexOf("\n") + 1);

// Patch an existing attribute.
const respA1 = await send({
  type: "write-attr",
  requestId: "e2e-a1",
  target: { kind: "react", file: "src/App.tsx", line: aLine, column: aColumn },
  name: "href",
  previousValue: "#work",
  newValue: "#pricing",
});
if (!respA1.ok) fail("attr patch failed: " + respA1.error);
written = readFileSync(targetFile, "utf8");
if (!written.includes('href="#pricing"')) {
  fail("href not patched: " + written.match(/<a[^>]*>/)?.[0]);
}

// Insert a missing attribute.
const respA2 = await send({
  type: "write-attr",
  requestId: "e2e-a2",
  target: { kind: "react", file: "src/App.tsx", line: aLine, column: aColumn },
  name: "title",
  previousValue: "",
  newValue: 'See "pricing" & more',
});
if (!respA2.ok) fail("attr insert failed: " + respA2.error);
written = readFileSync(targetFile, "utf8");
if (!written.includes('title="See &quot;pricing&quot; &amp; more"')) {
  fail("title not inserted/escaped: " + written.match(/<a[^>]*>/)?.[0]);
}

// Stale previousValue must be rejected.
const respA3 = await send({
  type: "write-attr",
  requestId: "e2e-a3",
  target: { kind: "react", file: "src/App.tsx", line: aLine, column: aColumn },
  name: "href",
  previousValue: "#work", // stale - now #pricing
  newValue: "#nope",
});
if (respA3.ok) fail("stale attr previousValue was NOT rejected");

// javascript: URLs must be rejected at the protocol layer.
const respA4 = await send({
  type: "write-attr",
  requestId: "e2e-a4",
  target: { kind: "react", file: "src/App.tsx", line: aLine, column: aColumn },
  name: "href",
  previousValue: "#pricing",
  newValue: "javascript:alert(1)",
});
if (respA4.ok) fail("javascript: URL was NOT rejected");
if (readFileSync(targetFile, "utf8").includes("javascript:alert")) {
  fail("javascript: URL landed in the file");
}

// --- delete element -----------------------------------------------------

const blankLines = (s) => s.split("\n").filter((l) => /^\s+$/.test(l)).length;

// Mismatch guard: a wrong previousTag must be rejected (nothing deleted).
const respD0 = await send({
  type: "delete-element",
  requestId: "e2e-d0",
  target: { kind: "react", file: "src/App.tsx", line: aLine, column: aColumn },
  previousTag: "button", // wrong - it is an <a>
});
if (respD0.ok) fail("delete with a mismatched previousTag was NOT rejected");

// Delete the <a>: it vanishes from the JSX, no extra blank line left behind.
const respD1 = await send({
  type: "delete-element",
  requestId: "e2e-d1",
  target: { kind: "react", file: "src/App.tsx", line: aLine, column: aColumn },
  previousTag: "a",
});
if (!respD1.ok) fail("delete failed: " + respD1.error);
written = readFileSync(targetFile, "utf8");
if (written.includes('href="#pricing"') || written.includes("See &quot;pricing")) {
  fail("deleted <a> still present in App.tsx");
}
if (blankLines(written) > blankLines(original)) {
  fail("delete left a blank indented line behind");
}

ws.close();
child.kill();
writeFileSync(targetFile, original);
console.log(
  "PASS (react): ping + text edit + mismatch reject + jsx escaping + style insert + style patch + transform (move) + style mismatch reject + attr patch/insert/mismatch + js-url reject + delete (mismatch reject + clean removal)",
);
