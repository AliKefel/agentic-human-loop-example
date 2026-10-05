import { describe, expect, it } from "vitest";
import { extractJson } from "@/lib/llm/json";

describe("extractJson", () => {
  it("strips ```json fences", () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("takes the first balanced object out of surrounding prose", () => {
    expect(extractJson('prefix {"a":{"b":2}} suffix')).toEqual({ a: { b: 2 } });
  });
  it("handles braces inside strings", () => {
    expect(extractJson('x {"s":"a } b {","n":1} y')).toEqual({ s: "a } b {", n: 1 });
  });
  it("parses plain JSON", () => {
    expect(extractJson('  {"ok":true}  ')).toEqual({ ok: true });
  });
  it("throws SyntaxError when there is no valid object", () => {
    expect(() => extractJson("Here is my analysis: {score: 7")).toThrow(SyntaxError);
    expect(() => extractJson("no json here")).toThrow(SyntaxError);
  });
});
