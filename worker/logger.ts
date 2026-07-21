/**
 * Minimal structured logger for the worker service.
 *
 * Railway captures stdout/stderr, so JSON lines are enough — no transport deps.
 * Never pass tokens or raw PII into `fields`; see CLAUDE.md on secrets at rest.
 */
type Level = "info" | "warn" | "error";

type Fields = Record<string, unknown>;

function emit(level: Level, message: string, fields: Fields = {}): void {
  // Fields spread first: a caller field named `message` must not shadow the log
  // message and make the line unsearchable.
  const line = JSON.stringify({
    ...fields,
    level,
    message,
    timestamp: new Date().toISOString(),
  });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, fields?: Fields) => emit("info", message, fields),
  warn: (message: string, fields?: Fields) => emit("warn", message, fields),
  error: (message: string, fields?: Fields) => emit("error", message, fields),
};

/** Errors cross the BullMQ boundary as `unknown`; normalize before logging. */
export function describeError(error: unknown): { error: string; stack?: string } {
  if (error instanceof Error) {
    return { error: error.message, stack: error.stack };
  }
  return { error: String(error) };
}
