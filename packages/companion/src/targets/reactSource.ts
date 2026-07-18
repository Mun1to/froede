import { promises as fs } from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import MagicString from "magic-string";
import { FroedeError } from "../errors.js";
import { resolveInsideRoot } from "../fsGuard.js";
import { deleteRangeOnItsLine, escapeJsxAttr, normalizeText } from "../text.js";

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

interface ParsedReactFile {
  root: string;
  absFile: string;
  relFile: string;
  source: string;
  ast: AstNode;
}

async function parseProjectFile(root: string, file: string): Promise<ParsedReactFile> {
  if (!/\.[jt]sx?$/.test(file)) {
    throw new FroedeError("react target only supports .js/.jsx/.ts/.tsx files");
  }
  const absFile = await resolveInsideRoot(root, file);
  const source = await fs.readFile(absFile, "utf8");
  let ast: AstNode;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: babelPluginsFor(file),
    }) as unknown as AstNode;
  } catch {
    throw new FroedeError("could not parse the source file");
  }
  return { root, absFile, relFile: file, source, ast };
}

/**
 * The vite plugin stamps an element's own start position (the `<`), taken
 * from the same parser, so an exact line/column match is expected.
 */
function findElementAt(ast: AstNode, line: number, column: number): AstNode {
  for (const node of walk(ast)) {
    if (
      node.type === "JSXElement" &&
      node.loc?.start.line === line &&
      node.loc?.start.column === column
    ) {
      return node;
    }
  }
  throw new FroedeError(
    "target element not found - the source file changed underneath, reload the page and retry",
  );
}

async function writeResult(
  root: string,
  absFile: string,
  updated: string,
): Promise<{ file: string }> {
  await fs.writeFile(absFile, updated, "utf8");
  return { file: path.relative(root, absFile).split(path.sep).join("/") };
}

export async function applyReactTextEdit(options: {
  root: string;
  file: string;
  line: number;
  column: number;
  previousText: string;
  newText: string;
}): Promise<{ file: string }> {
  const { absFile, source, ast } = await parseProjectFile(options.root, options.file);
  const element = findElementAt(ast, options.line, options.column);

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

  const s = new MagicString(source);
  s.overwrite(textNode.start, textNode.end, toJsxText(options.newText.trim()));
  return writeResult(options.root, absFile, s.toString());
}

/** Reads an ObjectProperty's key name, whether it's an Identifier or a StringLiteral key. */
function propertyKeyName(prop: AstNode): string | undefined {
  const key = prop.key as AstNode | undefined;
  if (!key) return undefined;
  if (typeof key.name === "string") return key.name;
  if (typeof key.value === "string") return key.value;
  return undefined;
}

export async function applyReactStyleEdit(options: {
  root: string;
  file: string;
  line: number;
  column: number;
  previousStyle?: Record<string, string>;
  style: Record<string, string>;
}): Promise<{ file: string }> {
  const { absFile, source, ast } = await parseProjectFile(options.root, options.file);
  const element = findElementAt(ast, options.line, options.column);
  const opening = element.openingElement as AstNode;
  const attrs = (opening.attributes as AstNode[] | undefined) ?? [];
  const styleAttr = attrs.find(
    (a) => a.type === "JSXAttribute" && (a.name as AstNode | undefined)?.name === "style",
  );

  let objectExpr: AstNode | undefined;
  let existingProps: AstNode[] = [];
  if (styleAttr) {
    const value = styleAttr.value as AstNode | null | undefined;
    const expr =
      value?.type === "JSXExpressionContainer" ? (value.expression as AstNode) : undefined;
    if (!expr || expr.type !== "ObjectExpression") {
      throw new FroedeError(
        "style attribute is not a plain object literal - edit it by hand for now",
      );
    }
    objectExpr = expr;
    existingProps = (expr.properties as AstNode[] | undefined) ?? [];
  }

  function findProp(key: string): AstNode | undefined {
    return existingProps.find((p) => propertyKeyName(p) === key);
  }

  function currentValueOf(key: string): string {
    const prop = findProp(key);
    if (!prop) return "";
    const val = prop.value as AstNode;
    if (val.type !== "StringLiteral" || typeof val.value !== "string") {
      throw new FroedeError(`style.${key} is not a plain string literal - edit it by hand for now`);
    }
    return val.value;
  }

  // Verify every key before writing anything (all-or-nothing).
  for (const key of Object.keys(options.style)) {
    const expected = options.previousStyle?.[key] ?? "";
    if (currentValueOf(key) !== expected) {
      throw new FroedeError(
        "style mismatch - the source file changed underneath, reload the page and retry",
      );
    }
  }

  const s = new MagicString(source);
  const toInsert: string[] = [];
  for (const [key, val] of Object.entries(options.style)) {
    const prop = findProp(key);
    if (prop) {
      const valNode = prop.value as AstNode;
      s.overwrite(valNode.start as number, valNode.end as number, JSON.stringify(val));
    } else {
      toInsert.push(`${key}: ${JSON.stringify(val)}`);
    }
  }

  if (toInsert.length > 0) {
    if (objectExpr) {
      // Insert right after the last existing property's own end (not right
      // before the closing `}`) so any padding the user/previous edit left
      // before `}` stays trailing instead of getting sandwiched by commas.
      const lastProp = existingProps[existingProps.length - 1];
      const insertAt =
        lastProp && typeof lastProp.end === "number"
          ? lastProp.end
          : (objectExpr.start as number) + 1;
      const prefix = existingProps.length > 0 ? ", " : "";
      s.appendLeft(insertAt, prefix + toInsert.join(", "));
    } else {
      const nameEnd = (opening.name as AstNode).end as number;
      s.appendLeft(nameEnd, ` style={{ ${toInsert.join(", ")} }}`);
    }
  }

  return writeResult(options.root, absFile, s.toString());
}

export async function applyReactAttrEdit(options: {
  root: string;
  file: string;
  line: number;
  column: number;
  name: string;
  previousValue: string;
  newValue: string;
}): Promise<{ file: string }> {
  const { absFile, source, ast } = await parseProjectFile(options.root, options.file);
  const element = findElementAt(ast, options.line, options.column);
  const opening = element.openingElement as AstNode;
  const attrs = (opening.attributes as AstNode[] | undefined) ?? [];
  const attr = attrs.find(
    (a) => a.type === "JSXAttribute" && (a.name as AstNode | undefined)?.name === options.name,
  );

  const s = new MagicString(source);
  const escaped = `"${escapeJsxAttr(options.newValue)}"`;

  if (attr) {
    const value = attr.value as AstNode | null | undefined;
    if (!value || value.type !== "StringLiteral") {
      throw new FroedeError(
        `${options.name} is not a plain string attribute ({expressions} are not editable) - edit it by hand`,
      );
    }
    if (String(value.value ?? "") !== options.previousValue) {
      throw new FroedeError(
        "attribute mismatch - the source file changed underneath, reload the page and retry",
      );
    }
    s.overwrite(value.start as number, value.end as number, escaped);
  } else {
    if (options.previousValue !== "") {
      throw new FroedeError(
        "attribute mismatch - the source file changed underneath, reload the page and retry",
      );
    }
    const nameEnd = (opening.name as AstNode).end as number;
    s.appendLeft(nameEnd, ` ${options.name}=${escaped}`);
  }

  return writeResult(options.root, absFile, s.toString());
}

export async function applyReactDelete(options: {
  root: string;
  file: string;
  line: number;
  column: number;
  previousTag: string;
}): Promise<{ file: string }> {
  const { absFile, source, ast } = await parseProjectFile(options.root, options.file);
  const element = findElementAt(ast, options.line, options.column);
  const opening = element.openingElement as AstNode;
  const tag = typeof (opening.name as AstNode).name === "string"
    ? String((opening.name as AstNode).name)
    : "";
  // Guard on the tag only for plain HTML elements (lowercase). A component
  // (<Foo/>) renders to some other DOM tag, so the client's previousTag can
  // never match its JSX name - there we trust the exact plugin-stamped loc.
  if (/^[a-z]/.test(tag) && tag.toLowerCase() !== options.previousTag.toLowerCase()) {
    throw new FroedeError(
      "element mismatch - the source file changed underneath, reload the page and retry",
    );
  }
  if (typeof element.start !== "number" || typeof element.end !== "number") {
    throw new FroedeError("element has no source location");
  }
  const updated = deleteRangeOnItsLine(source, element.start, element.end);
  return writeResult(options.root, absFile, updated);
}
