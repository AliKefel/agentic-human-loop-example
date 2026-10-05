export class NotFoundError extends Error {
  constructor(table: string, id: string) {
    super(`${table}: not found (${id})`);
    this.name = "NotFoundError";
  }
}

/** The run is in a state that does not allow the action (e.g. cancelling a terminal run). HTTP 409. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** The acting user's role does not allow the action. HTTP 403. */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Invalid input for an action. HTTP 400. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
