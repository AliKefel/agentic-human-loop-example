export class NotFoundError extends Error {
  constructor(table: string, id: string) {
    super(`${table}: not found (${id})`);
    this.name = "NotFoundError";
  }
}
