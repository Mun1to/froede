import path from "node:path";
import { parse } from "@babel/parser";
import MagicString from "magic-string";

interface AstNode {
  type: string;
  end?: number | null;
  loc?: { start: { line: number; column: number } } | null;
  name?: { type: string; name?: string; end?: number | null };
  attributes?: unknown[];
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

/**
 * Dev-only transform: stamps every lowercase (host) JSX element with
 * data-froede-loc="relative/File.tsx:line:column" pointing at the element's
 * `<` in the ORIGINAL source. Components (capitalized) are skipped so the
 * attribute never leaks into props. Never applies to production builds.
 */
export default function froede(): {
  name: string;
  apply: "serve";
  enforce: "pre";
  configResolved(config: { root: string }): void;
  transform(
    code: string,
    id: string,
  ): { code: string; map: ReturnType<MagicString["generateMap"]> } | null;
} {
  let root = process.cwd();
  return {
    name: "froede",
    apply: "serve",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
    },
    transform(code, id) {
      if (id.includes("node_modules") || id.startsWith("\0")) return null;
      const clean = id.split("?")[0]!;
      if (!/\.[jt]sx$/.test(clean)) return null;

      let ast: AstNode;
      try {
        ast = parse(code, {
          sourceType: "module",
          plugins: clean.endsWith(".tsx") ? ["jsx", "typescript"] : ["jsx"],
        }) as unknown as AstNode;
      } catch {
        return null;
      }

      const rel = path.relative(root, clean).split(path.sep).join("/");
      const s = new MagicString(code);
      let count = 0;

      for (const node of walk(ast)) {
        if (node.type !== "JSXOpeningElement") continue;
        const name = node.name;
        if (!name || name.type !== "JSXIdentifier" || !name.name) continue;
        if (!/^[a-z]/.test(name.name)) continue;
        const loc = node.loc?.start;
        if (!loc || typeof name.end !== "number") continue;
        s.appendLeft(
          name.end,
          ` data-froede-loc="${rel}:${loc.line}:${loc.column}"`,
        );
        count++;
      }

      if (count === 0) return null;
      return { code: s.toString(), map: s.generateMap({ hires: true }) };
    },
  };
}
