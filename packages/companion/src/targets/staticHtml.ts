import { promises as fs } from "node:fs";
import path from "node:path";
import { parse } from "parse5";
import { FroedeError } from "../errors.js";
import { resolveInsideRoot } from "../fsGuard.js";
import { escapeHtmlText, normalizeText, spliceKeepingPadding } from "../text.js";

interface Parse5Node {
  nodeName: string;
  tagName?: string;
  value?: string;
  childNodes?: Parse5Node[];
  sourceCodeLocation?: { startOffset: number; endOffset: number } | null;
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

export async function applyStaticTextEdit(options: {
  root: string;
  urlPath: string;
  domPath: number[];
  previousText: string;
  newText: string;
}): Promise<{ file: string }> {
  const relFile = urlPathToFile(options.urlPath);
  const absFile = await resolveInsideRoot(options.root, relFile);
  const source = await fs.readFile(absFile, "utf8");

  const document = parse(source, { sourceCodeLocationInfo: true }) as unknown as Parse5Node;
  const htmlEl = (document.childNodes ?? []).find(
    (n) => n.tagName === "html",
  );
  if (!htmlEl) throw new FroedeError("could not parse the HTML document");

  // parse5 builds the tree with the same WHATWG algorithm as the browser,
  // so walking the same element-only child indices lands on the same node.
  let node = htmlEl;
  for (const index of options.domPath) {
    const children = elementChildren(node);
    const next = children[index];
    if (!next) {
      throw new FroedeError(
        "target element not found - the page DOM is out of sync with the file on disk (reload the page)",
      );
    }
    node = next;
  }

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
  await fs.writeFile(absFile, updated, "utf8");
  return { file: path.relative(options.root, absFile).split(path.sep).join("/") };
}
