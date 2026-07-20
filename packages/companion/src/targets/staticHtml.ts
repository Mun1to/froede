import { promises as fs } from "node:fs";
import { parse } from "parse5";
import { FroedeError } from "../errors.js";
import { resolveInsideRoot } from "../fsGuard.js";
import { writeTracked } from "../history.js";
import { deleteRangeOnItsLine, escapeHtmlAttr, escapeHtmlText, normalizeText, spliceKeepingPadding } from "../text.js";
import { parseStyleAttr, serializeStyleAttr } from "../styleAttr.js";

interface AttrLocation {
  startOffset: number;
  endOffset: number;
}

interface Parse5Node {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: Parse5Node[];
  sourceCodeLocation?: {
    startOffset: number;
    endOffset: number;
    startTag?: { startOffset: number; endOffset: number; attrs?: Record<string, AttrLocation> };
  } | null;
}

function isElement(node: Parse5Node): boolean {
  return typeof node.tagName === "string";
}

function elementChildren(node: Parse5Node): Parse5Node[] {
  return (node.childNodes ?? []).filter(isElement);
}

/** Maps a URL pathname to a relative .html file path. */
export function urlPathToFile(urlPath: string): string {
  const clean = decodeURIComponent(urlPath.split("?")[0]!.split("#")[0]!);
  let rel = clean.replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  if (!/\.html?$/i.test(rel)) {
    throw new FroedeError(
      "static target only supports .html pages (got " + rel + ")",
    );
  }
  return rel;
}

interface LocatedStaticElement {
  absFile: string;
  relFile: string;
  source: string;
  node: Parse5Node;
}

async function locateStaticElement(
  root: string,
  urlPath: string,
  domPath: number[],
): Promise<LocatedStaticElement> {
  const relFile = urlPathToFile(urlPath);
  const absFile = await resolveInsideRoot(root, relFile);
  const source = await fs.readFile(absFile, "utf8");

  const document = parse(source, { sourceCodeLocationInfo: true }) as unknown as Parse5Node;
  const htmlEl = (document.childNodes ?? []).find((n) => n.tagName === "html");
  if (!htmlEl) throw new FroedeError("could not parse the HTML document");

  // parse5 builds the tree with the same WHATWG algorithm as the browser,
  // so walking the same element-only child indices lands on the same node.
  let node = htmlEl;
  for (const index of domPath) {
    const children = elementChildren(node);
    const next = children[index];
    if (!next) {
      throw new FroedeError(
        "target element not found - the page DOM is out of sync with the file on disk (reload the page)",
      );
    }
    node = next;
  }
  return { absFile, relFile, source, node };
}

export async function applyStaticTextEdit(options: {
  root: string;
  urlPath: string;
  domPath: number[];
  previousText: string;
  newText: string;
}): Promise<{ file: string }> {
  const { absFile, relFile, source, node } = await locateStaticElement(
    options.root,
    options.urlPath,
    options.domPath,
  );

  if (elementChildren(node).length > 0) {
    throw new FroedeError("element is not a simple text element");
  }
  const textNodes = (node.childNodes ?? []).filter(
    (n) => n.nodeName === "#text" && normalizeText(n.value ?? "") !== "",
  );
  if (textNodes.length !== 1) {
    throw new FroedeError("element is not a simple text element");
  }
  const textNode = textNodes[0]!;
  const loc = textNode.sourceCodeLocation;
  if (!loc) throw new FroedeError("element has no source location");

  if (normalizeText(textNode.value ?? "") !== normalizeText(options.previousText)) {
    throw new FroedeError(
      "text mismatch - the source file changed underneath, reload the page and retry",
    );
  }

  const updated = spliceKeepingPadding(
    source,
    loc.startOffset,
    loc.endOffset,
    escapeHtmlText(options.newText),
  );
  await writeTracked(absFile, source, updated);
  return { file: relFile };
}

/** Where to splice in a brand new style="..." attribute on the opening tag. */
function insertNewAttr(source: string, startTag: NonNullable<Parse5Node["sourceCodeLocation"]>["startTag"], attrText: string): string {
  const attrLocs = Object.values(startTag?.attrs ?? {});
  if (attrLocs.length > 0) {
    const insertAt = Math.min(...attrLocs.map((a) => a.startOffset));
    return source.slice(0, insertAt) + attrText + " " + source.slice(insertAt);
  }
  // No existing attributes: insert right before the tag's closing `>`.
  const insertAt = (startTag?.endOffset ?? source.length) - 1;
  return source.slice(0, insertAt) + " " + attrText + source.slice(insertAt);
}

export async function applyStaticStyleEdit(options: {
  root: string;
  urlPath: string;
  domPath: number[];
  previousStyle?: Record<string, string>;
  style: Record<string, string>;
}): Promise<{ file: string }> {
  const { absFile, relFile, source, node } = await locateStaticElement(
    options.root,
    options.urlPath,
    options.domPath,
  );
  const startTag = node.sourceCodeLocation?.startTag;
  if (!startTag) throw new FroedeError("element has no source location");

  const styleAttrLoc = startTag.attrs?.style;
  const existing = styleAttrLoc
    ? parseStyleAttr((node.attrs ?? []).find((a) => a.name === "style")?.value ?? "")
    : {};

  for (const key of Object.keys(options.style)) {
    const expected = options.previousStyle?.[key] ?? "";
    if ((existing[key] ?? "") !== expected) {
      throw new FroedeError(
        "style mismatch - the source file changed underneath, reload the page and retry",
      );
    }
  }

  const merged = { ...existing, ...options.style };
  const attrText = `style="${escapeHtmlAttr(serializeStyleAttr(merged))}"`;

  const updated = styleAttrLoc
    ? source.slice(0, styleAttrLoc.startOffset) + attrText + source.slice(styleAttrLoc.endOffset)
    : insertNewAttr(source, startTag, attrText);

  await writeTracked(absFile, source, updated);
  return { file: relFile };
}

export async function applyStaticAttrEdit(options: {
  root: string;
  urlPath: string;
  domPath: number[];
  name: string;
  previousValue: string;
  newValue: string;
}): Promise<{ file: string }> {
  const { absFile, relFile, source, node } = await locateStaticElement(
    options.root,
    options.urlPath,
    options.domPath,
  );
  const startTag = node.sourceCodeLocation?.startTag;
  if (!startTag) throw new FroedeError("element has no source location");

  const attrLoc = startTag.attrs?.[options.name];
  // parse5 decodes entities in attr values, matching el.getAttribute() in
  // the browser, so this comparison is apples to apples.
  const current = (node.attrs ?? []).find((a) => a.name === options.name)?.value ?? "";
  if (current !== options.previousValue) {
    throw new FroedeError(
      "attribute mismatch - the source file changed underneath, reload the page and retry",
    );
  }

  const attrText = `${options.name}="${escapeHtmlAttr(options.newValue)}"`;
  const updated = attrLoc
    ? source.slice(0, attrLoc.startOffset) + attrText + source.slice(attrLoc.endOffset)
    : insertNewAttr(source, startTag, attrText);

  await writeTracked(absFile, source, updated);
  return { file: relFile };
}

export async function applyStaticDelete(options: {
  root: string;
  urlPath: string;
  domPath: number[];
  previousTag: string;
}): Promise<{ file: string }> {
  const { absFile, relFile, source, node } = await locateStaticElement(
    options.root,
    options.urlPath,
    options.domPath,
  );
  const loc = node.sourceCodeLocation;
  if (!loc) throw new FroedeError("element has no source location");
  if ((node.tagName ?? "").toLowerCase() !== options.previousTag.toLowerCase()) {
    throw new FroedeError(
      "element mismatch - the source file changed underneath, reload the page and retry",
    );
  }
  const updated = deleteRangeOnItsLine(source, loc.startOffset, loc.endOffset);
  await writeTracked(absFile, source, updated);
  return { file: relFile };
}
