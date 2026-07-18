/** Collapse whitespace the way HTML rendering does, for tolerant comparison. */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** For values placed inside a double-quoted HTML attribute. */
export function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * For values placed inside a double-quoted JSX string attribute. JSX string
 * literals are HTML-like (entities are decoded on parse, JS backslash
 * escapes are NOT processed), so entity-escaping is the correct round-trip.
 */
export function escapeJsxAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Removes [start, end) from `source`, plus the element's own-line whitespace:
 * the leading indentation back to the previous newline (only when nothing but
 * whitespace precedes the element on that line) and one trailing line break.
 * That keeps a deleted element from leaving an empty, indented line behind,
 * while an element sharing its line with siblings only loses itself.
 */
export function deleteRangeOnItsLine(
  source: string,
  start: number,
  end: number,
): string {
  let from = start;
  let to = end;
  let i = start;
  while (i > 0 && (source[i - 1] === " " || source[i - 1] === "\t")) i--;
  if (i === 0 || source[i - 1] === "\n") from = i;
  if (source[to] === "\r" && source[to + 1] === "\n") to += 2;
  else if (source[to] === "\n") to += 1;
  return source.slice(0, from) + source.slice(to);
}

/**
 * Replaces [start, end) of `source` with `replacement`, preserving the
 * original leading/trailing whitespace of the replaced range (indentation,
 * newlines) so diffs stay minimal.
 */
export function spliceKeepingPadding(
  source: string,
  start: number,
  end: number,
  replacement: string,
): string {
  const original = source.slice(start, end);
  const lead = original.match(/^\s*/)?.[0] ?? "";
  const trail = original.match(/\s*$/)?.[0] ?? "";
  const body = replacement.trim();
  return (
    source.slice(0, start) + lead + body + trail + source.slice(end)
  );
}
