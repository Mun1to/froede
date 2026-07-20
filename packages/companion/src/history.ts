import { promises as fs } from "node:fs";
import { FroedeError } from "./errors.js";

interface FileChange {
  /** Absolute path, already validated to live inside the project root. */
  file: string;
  before: string;
  after: string;
}

interface HistoryEntry {
  label: string;
  changes: FileChange[];
}

/** Plenty for a session of hand edits, and bounded so memory cannot creep. */
const MAX_ENTRIES = 50;

/**
 * Undo/redo for the edits froede itself made. It lives in the companion
 * because the companion is what writes files, and it stores the exact bytes
 * on both sides of every write - never a reconstruction, which would drift
 * from what is actually on disk.
 *
 * One entry = one user action, even if that action touched several files:
 * a half-applied undo would be worse than no undo at all.
 */
export class EditHistory {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private pending: FileChange[] | null = null;

  /** Opens one user action; every write until commit() belongs to it. */
  begin(): void {
    this.pending = [];
  }

  record(change: FileChange): void {
    this.pending?.push(change);
  }

  /** Closes the action. An action that wrote nothing leaves no entry. */
  commit(label: string): void {
    const changes = this.pending;
    this.pending = null;
    if (!changes || changes.length === 0) return;
    this.undoStack.push({ label, changes });
    if (this.undoStack.length > MAX_ENTRIES) this.undoStack.shift();
    // A fresh edit abandons the redo branch, like every editor does.
    this.redoStack.length = 0;
  }

  abort(): void {
    this.pending = null;
  }

  depth(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }

  async undo(): Promise<{ label: string; files: string[] }> {
    return this.step("undo");
  }

  async redo(): Promise<{ label: string; files: string[] }> {
    return this.step("redo");
  }

  private async step(
    direction: "undo" | "redo",
  ): Promise<{ label: string; files: string[] }> {
    const from = direction === "undo" ? this.undoStack : this.redoStack;
    const to = direction === "undo" ? this.redoStack : this.undoStack;
    const entry = from[from.length - 1];
    if (!entry) throw new FroedeError(`nothing to ${direction}`);

    const expected = (c: FileChange): string =>
      direction === "undo" ? c.after : c.before;
    const wanted = (c: FileChange): string =>
      direction === "undo" ? c.before : c.after;

    // Verify EVERY file before touching any of them. If the user edited one by
    // hand since froede wrote it, reverting would silently destroy that work,
    // so the whole step is refused instead.
    for (const change of entry.changes) {
      let current: string;
      try {
        current = await fs.readFile(change.file, "utf8");
      } catch {
        throw new FroedeError(`cannot ${direction}: a file from that edit is gone`);
      }
      if (current !== expected(change)) {
        throw new FroedeError(
          `cannot ${direction}: that file changed outside froede since the edit - your own changes would be lost`,
        );
      }
    }

    for (const change of entry.changes) {
      await fs.writeFile(change.file, wanted(change), "utf8");
    }

    from.pop();
    to.push(entry);
    return { label: entry.label, files: entry.changes.map((c) => c.file) };
  }
}

export const history = new EditHistory();

/**
 * Writes a file and records how to put it back. Every target write goes
 * through here, so undo replays the exact previous bytes.
 */
export async function writeTracked(
  absFile: string,
  before: string,
  after: string,
): Promise<void> {
  await fs.writeFile(absFile, after, "utf8");
  history.record({ file: absFile, before, after });
}
