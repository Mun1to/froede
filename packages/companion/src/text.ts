/** Collapse whitespace the way HTML rendering does, for tolerant comparison. */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
