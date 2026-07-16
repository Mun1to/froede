/** Error whose message is safe to send back to the extension as-is. */
export class FroedeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FroedeError";
  }
}

export function publicErrorMessage(err: unknown): string {
  if (err instanceof FroedeError) return err.message;
  if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
    return "file not found inside the project root";
  }
  // Never leak stack traces or absolute paths from unexpected errors.
  return "internal companion error (see companion terminal)";
}
