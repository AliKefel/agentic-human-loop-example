import { NextResponse } from "next/server";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Maps harness errors to HTTP: Conflict 409, Forbidden 403, NotFound 404, Validation 400, else 500. */
export function errorResponse(e: unknown, label: string) {
  if (e instanceof ConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
  if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
  if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
  if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
  console.error(`${label} failed`, e);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
