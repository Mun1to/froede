/**
 * Ambient types shared by the extension scripts. These MIRROR the wire
 * contract defined in packages/protocol (the source of truth) - keep them
 * in sync by hand. The extension scripts are compiled as plain classic
 * scripts (no runtime imports) so they can run untouched as MV3 content
 * scripts and service worker without a bundler.
 */

type FroedeEditTarget =
  | { kind: "react"; file: string; line: number; column: number }
  | { kind: "static-html"; urlPath: string; domPath: number[] };

/** Mirrors packages/protocol StyleEdits - keep the key set in sync by hand. */
type FroedeStyleEdits = Partial<{
  width: string;
  height: string;
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontWeight: string;
  padding: string;
  margin: string;
  transform: string;
}>;

/** Mirrors packages/protocol ATTR_NAMES - keep in sync by hand. */
type FroedeAttrName = "alt" | "href" | "placeholder" | "src" | "title";

/** content/popup -> background */
type FroedeRuntimeMessage =
  | {
      kind: "froede-write";
      target: FroedeEditTarget;
      previousText: string;
      newText: string;
    }
  | {
      kind: "froede-write-style";
      target: FroedeEditTarget;
      previousStyle: FroedeStyleEdits;
      style: FroedeStyleEdits;
    }
  | {
      kind: "froede-write-attr";
      target: FroedeEditTarget;
      name: FroedeAttrName;
      previousValue: string;
      newValue: string;
    }
  | {
      kind: "froede-delete";
      target: FroedeEditTarget;
      previousTag: string;
    }
  | { kind: "froede-test" }
  | { kind: "froede-toggle-tab" };

/** background -> content */
interface FroedeToggleMessage {
  kind: "froede-toggle";
}

interface FroedeWriteResponse {
  ok: boolean;
  file?: string;
  error?: string;
}

interface FroedeTestResponse {
  ok: boolean;
  root?: string;
  companionVersion?: string;
  error?: string;
}
