export class LlmTimeoutError extends Error {
  constructor(m = "LLM call timed out") {
    super(m);
    this.name = "LlmTimeoutError";
  }
}
