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

export const ClientMessage = z.discriminatedUnion("type", [
  PingRequest,
  WriteTextRequest,
]);
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
