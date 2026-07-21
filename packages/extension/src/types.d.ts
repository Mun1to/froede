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
      /** Set to isolate the edit to one .map() instance - see protocol's OnlyInstance. */
      onlyInstance?: number;
    }
  | {
      kind: "froede-write-style";
      target: FroedeEditTarget;
      previousStyle: FroedeStyleEdits;
      style: FroedeStyleEdits;
      onlyInstance?: number;
    }
  | {
      kind: "froede-write-attr";
      target: FroedeEditTarget;
      name: FroedeAttrName;
      previousValue: string;
      newValue: string;
      onlyInstance?: number;
    }
  | {
      kind: "froede-delete";
      target: FroedeEditTarget;
      previousTag: string;
    }
  | { kind: "froede-undo" }
  | { kind: "froede-redo" }
  | { kind: "froede-test" }
  | { kind: "froede-toggle-tab" }
  | { kind: "froede-tab-state" };

/** background -> content */
type FroedeContentMessage =
  | { kind: "froede-toggle" }
  /** Read edit mode without flipping it, so the popup can open in sync. */
  | { kind: "froede-state" };

interface FroedeWriteResponse {
  ok: boolean;
  file?: string;
  error?: string;
  /** Ready-to-paste command that would fix the error, when one exists. */
  fix?: string;
  /** Steps available in each direction, for the overlay's history badge. */
  undoDepth?: number;
  redoDepth?: number;
}

interface FroedeTestResponse {
  ok: boolean;
  root?: string;
  companionVersion?: string;
  error?: string;
  fix?: string;
}
