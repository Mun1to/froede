// Unit checks for the companion's pure helpers: fast, no server, no browser.
// These cover logic the e2e scripts cannot reach directly.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..");

const load = (rel) =>
  import(pathToFileURL(path.join(repo, "packages", "companion", "dist", rel)).href);

const { findGitRoot } = await load("token.js");
const { isExtensionId, extensionIdFromOrigin, pairingCommand } =
  await load("extensions.js");
const { applyReactStyleEdit, applyReactAttrEdit, applyReactTextEdit } =
  await load("targets/reactSource.js");

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) return;
  failures++;
  console.error(`FAIL: ${name}${detail ? " - " + detail : ""}`);
}

// --- findGitRoot ----------------------------------------------------------
// The monorepo case that made froede claim "No git repo detected": .git lives
// ABOVE the folder the companion was started in.
const deep = path.join(repo, "packages", "companion", "src");
check(
  "findGitRoot walks up to the repo root",
  (await findGitRoot(deep)) === repo,
  `got ${await findGitRoot(deep)}`,
);
check("findGitRoot finds a repo from its own root", (await findGitRoot(repo)) === repo);

const outside = await mkdtemp(path.join(os.tmpdir(), "froede-nogit-"));
try {
  check(
    "findGitRoot returns null outside any repo",
    (await findGitRoot(outside)) === null,
    `got ${await findGitRoot(outside)}`,
  );
} finally {
  await rm(outside, { recursive: true, force: true });
}

// A worktree or submodule has .git as a FILE, not a directory.
const worktree = await mkdtemp(path.join(os.tmpdir(), "froede-worktree-"));
try {
  await writeFile(path.join(worktree, ".git"), "gitdir: /somewhere/else\n");
  const sub = path.join(worktree, "web", "src");
  await mkdir(sub, { recursive: true });
  check(
    "findGitRoot accepts a .git FILE (worktree/submodule)",
    (await findGitRoot(sub)) === worktree,
    `got ${await findGitRoot(sub)}`,
  );
} finally {
  await rm(worktree, { recursive: true, force: true });
}

// --- extension identity ---------------------------------------------------
const REAL_ID = "clfpgnbnfgaabdoiadjfkhfhmnfemeba";
check("isExtensionId accepts a real id", isExtensionId(REAL_ID));
check("isExtensionId rejects a short id", !isExtensionId("abc"));
check("isExtensionId rejects out-of-range letters", !isExtensionId("z".repeat(32)));
check(
  "extensionIdFromOrigin extracts the id",
  extensionIdFromOrigin(`chrome-extension://${REAL_ID}`) === REAL_ID,
);
check(
  "extensionIdFromOrigin rejects a web origin",
  extensionIdFromOrigin("http://evil.example") === null,
);
check("extensionIdFromOrigin tolerates a missing Origin", extensionIdFromOrigin(undefined) === null);
check(
  "pairingCommand names the id",
  pairingCommand(REAL_ID, 4519).includes(REAL_ID) &&
    pairingCommand(REAL_ID, 4519).includes("npx froede"),
);
check(
  "pairingCommand omits --port on the default port",
  !pairingCommand(REAL_ID, 4519).includes("--port"),
);
check(
  "pairingCommand carries a non-default port",
  pairingCommand(REAL_ID, 4520).includes("--port 4520"),
  pairingCommand(REAL_ID, 4520),
);

// --- undo / redo ----------------------------------------------------------
const { EditHistory } = await load("history.js");
const histDir = await mkdtemp(path.join(os.tmpdir(), "froede-history-"));
try {
  const fileA = path.join(histDir, "a.txt");
  const fileB = path.join(histDir, "b.txt");
  const read = (f) => readFile(f, "utf8");
  const edit = async (h, file, before, after) => {
    await writeFile(file, after);
    h.record({ file, before, after });
  };

  await writeFile(fileA, "v1");
  await writeFile(fileB, "b1");
  const h = new EditHistory();

  // One user action touching TWO files must undo as a single step.
  h.begin();
  await edit(h, fileA, "v1", "v2");
  await edit(h, fileB, "b1", "b2");
  h.commit("two-file edit");
  check("one action = one entry", h.depth().undo === 1 && h.depth().redo === 0);

  await h.undo();
  check(
    "undo restores every file of the action",
    (await read(fileA)) === "v1" && (await read(fileB)) === "b1",
  );
  check("undo moves the entry to redo", h.depth().undo === 0 && h.depth().redo === 1);

  await h.redo();
  check(
    "redo reapplies every file",
    (await read(fileA)) === "v2" && (await read(fileB)) === "b2",
  );

  // A hand edit made outside froede must never be clobbered, and the refusal
  // must be atomic: no file of the entry may be touched.
  await h.undo();
  await writeFile(fileA, "hand edited");
  let refused = false;
  try {
    await h.redo();
  } catch {
    refused = true;
  }
  check("redo refuses when the file changed outside froede", refused);
  check("the hand edit survived", (await read(fileA)) === "hand edited");
  check("the other file of that entry was left alone", (await read(fileB)) === "b1");

  // A fresh edit abandons the redo branch, like every editor.
  const h2 = new EditHistory();
  await writeFile(fileA, "x1");
  h2.begin();
  await edit(h2, fileA, "x1", "x2");
  h2.commit("e1");
  await h2.undo();
  check("redo available after undo", h2.depth().redo === 1);
  h2.begin();
  await edit(h2, fileA, "x1", "y2");
  h2.commit("e2");
  check("a new edit drops the redo branch", h2.depth().redo === 0);

  const h3 = new EditHistory();
  let empty = false;
  try {
    await h3.undo();
  } catch {
    empty = true;
  }
  check("undo on an empty history fails cleanly", empty);

  const h4 = new EditHistory();
  h4.begin();
  h4.commit("noop");
  check("an action that wrote nothing leaves no entry", h4.depth().undo === 0);

  const h5 = new EditHistory();
  h5.begin();
  await edit(h5, fileA, "y2", "z3");
  h5.abort();
  check("an aborted action leaves no entry", h5.depth().undo === 0);
} finally {
  await rm(histDir, { recursive: true, force: true });
}

// --- isolate one .map() instance -------------------------------------------
// Locates a tag's own <TAG position the same way @babel/parser reports a
// JSXElement's start (its own `<`), so line/column match what findElementAt
// expects.
function locate(source, needle) {
  const idx = source.indexOf(needle);
  if (idx < 0) throw new Error(`fixture missing ${JSON.stringify(needle)}`);
  const before = source.slice(0, idx);
  return { line: before.split("\n").length, column: idx - (before.lastIndexOf("\n") + 1) };
}

const isolateDir = await mkdtemp(path.join(os.tmpdir(), "froede-isolate-"));
try {
  const write = (name, code) => writeFile(path.join(isolateDir, name), code, "utf8");
  const read = (name) => readFile(path.join(isolateDir, name), "utf8");

  // Case 1: callback already names an index (`(item, i) =>`) - reuse it, no
  // signature change.
  await write(
    "reuse.tsx",
    `export default function App() {
  const items = ["a", "b", "c"];
  return <div>{items.map((item, i) => (<p key={i} className="lead">{item}</p>))}</div>;
}
`,
  );
  {
    const source = await read("reuse.tsx");
    const { line, column } = locate(source, "<p ");
    await applyReactStyleEdit({
      root: isolateDir,
      file: "reuse.tsx",
      line,
      column,
      previousStyle: {},
      style: { color: "#ff0000" },
      onlyInstance: 1,
    });
    const updated = await read("reuse.tsx");
    check(
      "isolate style reuses an existing index param, no signature change",
      updated.includes("(item, i) =>") &&
        updated.includes('style={i === 1 ? {...({}), color: "#ff0000"} : undefined}'),
      updated,
    );
  }

  // Case 2: single param WITH parens - index gets appended inside them.
  await write(
    "parens.tsx",
    `export default function App() {
  const items = ["a", "b"];
  return <div>{items.map((item) => (<p className="x">{item}</p>))}</div>;
}
`,
  );
  {
    const source = await read("parens.tsx");
    const { line, column } = locate(source, "<p ");
    await applyReactStyleEdit({
      root: isolateDir,
      file: "parens.tsx",
      line,
      column,
      previousStyle: {},
      style: { width: "10px" },
      onlyInstance: 0,
    });
    const updated = await read("parens.tsx");
    check(
      "isolate style adds an index param inside existing parens",
      updated.includes("(item, __froedeIdx) =>") &&
        updated.includes('__froedeIdx === 0 ? {...({}), width: "10px"} : undefined'),
      updated,
    );
  }

  // Case 3: single BARE param (no parens) - froede must add the parens too,
  // not just splice a second name into a list that never existed.
  await write(
    "bare.tsx",
    `export default function App() {
  const items = ["a", "b"];
  return <div>{items.map(item => (<a href="#x">{item}</a>))}</div>;
}
`,
  );
  {
    const source = await read("bare.tsx");
    const { line, column } = locate(source, "<a ");
    await applyReactAttrEdit({
      root: isolateDir,
      file: "bare.tsx",
      line,
      column,
      name: "href",
      previousValue: "#x",
      newValue: "#y",
      onlyInstance: 1,
    });
    const updated = await read("bare.tsx");
    check(
      "isolate attr wraps a bare single param in parens before adding the index",
      updated.includes("(item, __froedeIdx) =>") &&
        updated.includes('href={__froedeIdx === 1 ? "#y" : "#x"}'),
      updated,
    );
  }

  // Case 4: ZERO params (item is ignored entirely) - froede inserts a `_`
  // placeholder plus the index, and can still isolate plain JSXText.
  await write(
    "zero.tsx",
    `export default function App() {
  return <div>{[1, 2, 3].map(() => (<p className="tag">Same</p>))}</div>;
}
`,
  );
  {
    const source = await read("zero.tsx");
    const { line, column } = locate(source, "<p ");
    await applyReactTextEdit({
      root: isolateDir,
      file: "zero.tsx",
      line,
      column,
      previousText: "Same",
      newText: "Changed",
      onlyInstance: 2,
    });
    const updated = await read("zero.tsx");
    check(
      "isolate text on a zero-param callback inserts `_, __froedeIdx`",
      updated.includes("(_, __froedeIdx) =>") &&
        updated.includes('{__froedeIdx === 2 ? "Changed" : "Same"}'),
      updated,
    );
  }

  // Case 5: not inside any .map() at all - must refuse cleanly, never guess.
  await write(
    "solo.tsx",
    `export default function App() {
  return <p className="solo">Hello</p>;
}
`,
  );
  {
    const source = await read("solo.tsx");
    const { line, column } = locate(source, "<p ");
    let refused = false;
    try {
      await applyReactStyleEdit({
        root: isolateDir,
        file: "solo.tsx",
        line,
        column,
        previousStyle: {},
        style: { color: "#000000" },
        onlyInstance: 0,
      });
    } catch (err) {
      refused = /cannot isolate/.test(String(err?.message ?? err));
    }
    check("isolate refuses when the element is not inside a .map()", refused);
  }
} finally {
  await rm(isolateDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} unit check(s) failed`);
  process.exit(1);
}
console.log(
  "PASS (unit): findGitRoot (walks up / own root / outside repo / .git as file) + extension id parsing + pairing command + undo/redo (multi-file atomic, redo branch dropped, refuses to clobber hand edits, empty/noop/abort) + isolate-one-map-instance (reuse index param / add param inside parens / wrap bare param in parens / zero-param placeholder / refuses outside a .map())",
);
