import { test, expect } from "vitest";
import { resolveActingUser, FALLBACK_USERS } from "@/lib/current-user";

test("defaults to Pat Partner when cookie missing or unknown", () => {
  expect(resolveActingUser(FALLBACK_USERS, undefined).name).toBe("Pat Partner");
  expect(resolveActingUser(FALLBACK_USERS, "nope").name).toBe("Pat Partner");
});
test("honours a valid cookie", () => {
  expect(resolveActingUser(FALLBACK_USERS, FALLBACK_USERS[2].id).name).toBe("Gen GP");
});

import { assertKnownUser } from "@/lib/current-user";
test("assertKnownUser rejects unknown ids", () => {
  expect(() => assertKnownUser(FALLBACK_USERS, "bogus")).toThrow("Unknown user");
  expect(assertKnownUser(FALLBACK_USERS, FALLBACK_USERS[0].id).name).toBe("Avery Analyst");
});
