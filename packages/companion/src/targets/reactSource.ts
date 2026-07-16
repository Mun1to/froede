import { promises as fs } from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import { FroedeError } from "../errors.js";
import { resolveInsideRoot } from "../fsGuard.js";
import { normalizeText, spliceKeepingPadding } from "../text.js";

interface AstNode {
  type: string;
  start?: number | null;
  end?: number | null;
  value?: unknown;
  loc?: { start: { line: number; column: number } } | null;
  [key: string]: unknown;
}

function* walk(node: AstNode): Generator<AstNode> {
  yield node;
  for (const key of Object.keys(node)) {
    if (key === "loc") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && "type" in item) {
          yield* walk(item as AstNode);
        }
      }
    } else if (value && typeof value === "object" && "type" in value) {
      yield* walk(value as AstNode);
    }
  }
}

function babelPluginsFor(file: string): ("jsx" | "typescript")[] {
  if (file.endsWith(".tsx")) return ["jsx", "typescript"];
  if (file.endsWith(".ts")) return ["typescript"];
  return ["jsx"];
}

/** JSXText cannot contain these characters; wrap as a string expression. */
function toJsxText(s: string): string {
  if (/[{}<>]/.test(s)) return "{" + JSON.stringify(s) + "}";
  return s;
}

export async function applyReactTextEdit(options: {
  root: string;
  file: string;
  line: number;
  column: number;
  previousText: string;
  newText: string;
}): Promise<{ file: string }> {
  if (!/\.[jt]sx?$/.test(options.file)) {
    throw new FroedeError("react target only supports .js/.jsx/.ts/.tsx files");
  }
  const absFile = await resolveInsideRoot(options.root, options.file);
  const source = await fs.readFile(absFile, "utf8");

  let ast: AstNode;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: babelPluginsFor(options.file),
    }) as unknown as AstNode;
  } catch {
    throw new FroedeError("could not parse the source file");
  }

  // The vite plugin stamped the element's own start position (the `<`),
  // taken from the same parser, so an exact line/column match is expected.
  let element: AstNode | undefined;
  for (const node of walk(ast)) {
    if (
      node.type === "JSXElement" &&
      node.loc?.start.line === options.line &&
      node.loc?.start.column === options.column
    ) {
      element = node;
      break;
    }
  }
  if (!element) {
    throw new FroedeError(
      "target element not found - the source file changed underneath, reload the page and retry",
    );
  }

  const children = (element.children as AstNode[] | undefined) ?? [];
  const meaningful = children.filter(
    (c) => !(c.type === "JSXText" && normalizeText(String(c.value ?? "")) === ""),
  );
  if (meaningful.length !== 1 || meaningful[0]!.type !== "JSXText") {
    throw new FroedeError(
      "element is not a plain text element (nested elements or {expressions} are not editable in v0.1)",
    );
  }
  const textNode = meaningful[0]!;
  if (typeof textNode.start !== "number" || typeof textNode.end !== "number") {
    throw new FroedeError("element has no source location");
  }

  if (normalizeText(String(textNode.value ?? "")) !== normalizeText(options.previousText)) {
    throw new FroedeError(
      "text mismatch - the source file changed underneath, reload the page and retry",
    );
  }

  const updated = spliceKeepingPadding(
    source,
    textNode.start,
    textNode.end,
    toJsxText(options.newText.trim()),
  );
  await fs.writeFile(absFile, updated, "utf8");
  return { file: path.relative(options.root, absFile).split(path.sep).join("/") };
}
