import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";

export type ActionFailure = { ok: false; error: string; code: 400 | 403 | 404 | 409 | 500 };

/** Maps harness errors to a server-action failure (the client shows `error` in a toast). */
export function actionFailure(e: unknown, label: string, notFound = "Not found"): ActionFailure {
  if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: 403 };
  if (e instanceof ConflictError) return { ok: false, error: e.message, code: 409 };
  if (e instanceof ValidationError) return { ok: false, error: e.message, code: 400 };
  if (e instanceof NotFoundError) return { ok: false, error: notFound, code: 404 };
  console.error(`${label} failed`, e);
  return { ok: false, error: `Something went wrong (${label})`, code: 500 };
}
