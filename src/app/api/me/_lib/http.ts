/**
 * Route-handler plumbing for the buyer-account API (`/api/me`, spec §7).
 *
 * Mirrors the seller listings plumbing: one `{ error: { code, message } }`
 * envelope, Zod on every input, and a single {@link handleRoute} wrapper that
 * maps the typed errors the auth + lists layers already throw:
 *
 *   - `ZodError`             → 400 VALIDATION_ERROR
 *   - `AuthenticationError`  → 401 UNAUTHORIZED         (from `@/lib/auth`)
 *   - `AuthorizationError`   → 403 FORBIDDEN            (from `@/lib/auth`)
 *   - `ListConflictError`    → 409 LIST_NAME_TAKEN      (from `@/lib/lists`)
 *   - `DefaultListError`     → 409 DEFAULT_LIST_IMMUTABLE
 *   - anything with numeric `status` + string `code`   → itself
 *   - anything else          → 500 INTERNAL_ERROR (details never leaked)
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Structural shape every app-level error class satisfies (status + code). */
interface AppError {
  status: number;
  code: string;
  message: string;
}

function isAppError(err: unknown): err is AppError {
  if (!(err instanceof Error)) return false;
  const candidate = err as Partial<AppError>;
  return (
    typeof candidate.status === "number" && typeof candidate.code === "string"
  );
}

/** Malformed JSON body — thrown by {@link readJson}, mapped to 400. */
export class BadRequestError extends Error {
  readonly code = "BAD_REQUEST";
  readonly status = 400;

  constructor(message = "Bad request.") {
    super(message);
    this.name = "BadRequestError";
  }
}

/** A list (or the listing being saved) is missing or not the caller's. */
export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";
  readonly status = 404;

  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** The spec §7 error envelope. */
export function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Success envelope — every handler returns data under `data`. */
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

/** Turn any thrown value into the standard error envelope. */
export function mapErrorToResponse(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    const message = err.issues[0]?.message ?? "Invalid request body.";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }
  if (isAppError(err)) {
    return errorResponse(err.code, err.message, err.status);
  }
  console.error("Unhandled /api/me route error", err);
  return errorResponse("INTERNAL_ERROR", "Something went wrong.", 500);
}

/** Run a route body, converting any thrown error into the envelope. */
export async function handleRoute(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    return mapErrorToResponse(err);
  }
}

/** Parse a JSON request body, or throw a 400 on malformed input. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
  }
}
