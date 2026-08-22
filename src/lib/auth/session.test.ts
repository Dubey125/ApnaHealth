import { test } from "node:test";
import assert from "node:assert/strict";
import { signSession, verifySession } from "./session";

process.env.SESSION_SECRET ??= "test-secret-not-for-production-use-only-32b";

test("verifySession returns the original payload for a valid token", async () => {
  const token = await signSession({ userId: "abc123" }, "1h");
  const payload = await verifySession<{ userId: string }>(token);
  assert.equal(payload?.userId, "abc123");
});

test("verifySession returns null for an expired token", async () => {
  const token = await signSession({ userId: "abc123" }, "-1s");
  const payload = await verifySession(token);
  assert.equal(payload, null);
});

test("verifySession returns null for a tampered token", async () => {
  const token = await signSession({ userId: "abc123" }, "1h");
  const parts = token.split(".");
  // Flip the payload segment so the signature no longer matches.
  const tampered = [parts[0], parts[1].slice(0, -1) + (parts[1].at(-1) === "A" ? "B" : "A"), parts[2]].join(".");
  const payload = await verifySession(tampered);
  assert.equal(payload, null);
});

test("verifySession returns null for garbage input", async () => {
  const payload = await verifySession("not.a.jwt");
  assert.equal(payload, null);
});
