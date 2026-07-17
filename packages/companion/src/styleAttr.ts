/** camelCase (wire protocol, JS-style) <-> kebab-case (real CSS) conversions. */
export function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

export function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Parses a style="..." attribute value into a { camelProp: value } map. */
export function parseStyleAttr(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const decl of value.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (prop) result[kebabToCamel(prop)] = val;
  }
  return result;
}

/** Serializes a { camelProp: value } map back into CSS declaration text. */
export function serializeStyleAttr(props: Record<string, string>): string {
  return Object.entries(props)
    .map(([k, v]) => `${camelToKebab(k)}: ${v};`)
    .join(" ");
}
