import { z } from "zod";

/**
 * Bump this whenever the wire format changes in an incompatible way.
 * Extension and companion are distributed separately, so both sides
 * check it during the ping handshake and fail loudly on mismatch.
 */
export const PROTOCOL_VERSION = 1;

/** Where an edit should land, resolved by the content script at click time. */
export const EditTarget = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("react"),
    /** Path relative to the project root, forward slashes (from data-froede-loc). */
    file: z.string().min(1).max(500),
    /** 1-based line of the JSX element start (`<`), as reported by @babel/parser. */
    line: z.number().int().min(1),
    /** 0-based column of the JSX element start, as reported by @babel/parser. */
    column: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("static-html"),
    /** location.pathname of the page ("/" resolves to index.html). */
    urlPath: z.string().min(1).max(2000),
    /**
     * Child-element indices from <html> down to the clicked element,
     * using element-only children on both sides (DOM .children / parse5
     * element nodes) so browser and companion walk the same tree shape.
     */
    domPath: z.array(z.number().int().min(0)).max(64),
  }),
]);
export type EditTarget = z.infer<typeof EditTarget>;

export const PingRequest = z.object({
  type: z.literal("ping"),
  requestId: z.string().min(1).max(100),
  protocolVersion: z.number().int(),
});
export type PingRequest = z.infer<typeof PingRequest>;

export const WriteTextRequest = z.object({
  type: z.literal("write-text"),
  requestId: z.string().min(1).max(100),
  target: EditTarget,
  /**
   * What the content script believes the element's text is right now.
   * The companion verifies it against what it finds at the resolved
   * location before splicing, and aborts on mismatch (the source file
   * changed underneath, or the DOM drifted from the file on disk).
   */
  previousText: z.string().max(50_000),
  newText: z.string().max(50_000),
});
export type WriteTextRequest = z.infer<typeof WriteTextRequest>;

/**
 * Allowed style properties for v0.2, each with a strict value format.
 * This is deliberately an allowlist, not free-form CSS: values get spliced
 * straight into source files (a JS string literal for React, a style="..."
 * attribute for HTML), so a tight regex per property is what keeps that
 * splice injection-safe without needing contextual escaping. Keys are
 * always camelCase (JS style) on the wire; the static-html target converts
 * to kebab-case CSS itself.
 */
const PX_OR_PERCENT = /^\d+(\.\d+)?(px|%)$/;
const PX_OR_NONE = /^(none|\d+(\.\d+)?(px|%))$/;
const PX_ONLY = /^\d+(\.\d+)?px$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const FONT_WEIGHT = /^(normal|bold|[1-9]00)$/;

export const StyleEdits = z
  .object({
    width: z.string().regex(PX_OR_PERCENT).optional(),
    height: z.string().regex(PX_OR_PERCENT).optional(),
    // Paired with width/height by the content script whenever the element's
    // existing CSS already constrains that dimension (e.g. a class with
    // max-width) - otherwise the inline width/height would be silently
    // capped and dragging would look like it "only works in one direction".
    maxWidth: z.string().regex(PX_OR_NONE).optional(),
    maxHeight: z.string().regex(PX_OR_NONE).optional(),
    minWidth: z.string().regex(PX_OR_NONE).optional(),
    minHeight: z.string().regex(PX_OR_NONE).optional(),
    color: z.string().regex(HEX_COLOR).optional(),
    backgroundColor: z.string().regex(HEX_COLOR).optional(),
    fontSize: z.string().regex(PX_ONLY).optional(),
    fontWeight: z.string().regex(FONT_WEIGHT).optional(),
    padding: z.string().regex(PX_ONLY).optional(),
    margin: z.string().regex(PX_ONLY).optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, "at least one style property required");
export type StyleEdits = z.infer<typeof StyleEdits>;

export const WriteStyleRequest = z.object({
  type: z.literal("write-style"),
  requestId: z.string().min(1).max(100),
  target: EditTarget,
  /**
   * What the client believes each edited property is currently set to
   * inline right now (omit a key, or use "", when it believes the
   * property is not set yet). Same drift-guard as previousText, checked
   * per key before any write happens.
   */
  previousStyle: z.record(z.string(), z.string()).optional(),
  style: StyleEdits,
});
export type WriteStyleRequest = z.infer<typeof WriteStyleRequest>;

/**
 * Editable attributes, an allowlist just like StyleEdits. Values are
 * free text (they get entity-escaped before splicing), but URL-bearing
 * attributes reject script-ish schemes: the user is editing their own
 * site, but froede must never be the vehicle that writes an XSS vector
 * into a source file.
 */
export const ATTR_NAMES = ["alt", "href", "placeholder", "src", "title"] as const;
export const AttrName = z.enum(ATTR_NAMES);
export type AttrName = z.infer<typeof AttrName>;

const FORBIDDEN_URL_SCHEME = /^\s*(javascript|vbscript|data)\s*:/i;

// Plain object (no .refine) because zod's discriminatedUnion only accepts
// bare ZodObjects; the scheme check lives on ClientMessage below.
export const WriteAttrRequest = z.object({
  type: z.literal("write-attr"),
  requestId: z.string().min(1).max(100),
  target: EditTarget,
  name: AttrName,
  /** Current value as the client sees it ("" when the attribute is absent). */
  previousValue: z.string().max(10_000),
  newValue: z.string().max(10_000),
});
export type WriteAttrRequest = z.infer<typeof WriteAttrRequest>;

export const ClientMessage = z
  .discriminatedUnion("type", [
    PingRequest,
    WriteTextRequest,
    WriteStyleRequest,
    WriteAttrRequest,
  ])
  .superRefine((msg, ctx) => {
    if (
      msg.type === "write-attr" &&
      (msg.name === "href" || msg.name === "src") &&
      FORBIDDEN_URL_SCHEME.test(msg.newValue)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "script-scheme URLs are not allowed in href/src",
      });
    }
  });
export type ClientMessage = z.infer<typeof ClientMessage>;

/** Companion -> extension responses (not validated client-side, plain types). */
export interface PongResponse {
  type: "pong";
  requestId: string;
  protocolVersion: number;
  companionVersion: string;
  /** Absolute project root the companion is confined to. */
  root: string;
}

export interface WriteResultResponse {
  type: "write-result";
  requestId: string;
  ok: boolean;
  /** Relative path of the file that was written (when ok). */
  file?: string;
  error?: string;
}

export type ServerMessage = PongResponse | WriteResultResponse;
