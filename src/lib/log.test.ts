import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLogEntry, extractDigest, isExpectedNextControlFlowDigest } from "./log";

test("formatLogEntry produces structured JSON with level, message, time and context", () => {
  const now = new Date("2026-08-20T10:00:00.000Z");
  const line = formatLogEntry("error", "boom", { path: "/app/queue/1", statusCode: 500 }, now);
  assert.deepEqual(JSON.parse(line), {
    level: "error",
    message: "boom",
    time: "2026-08-20T10:00:00.000Z",
    path: "/app/queue/1",
    statusCode: 500,
  });
});

test("formatLogEntry with no context still includes level/message/time", () => {
  const now = new Date("2026-08-20T10:00:00.000Z");
  assert.deepEqual(JSON.parse(formatLogEntry("info", "started", undefined, now)), {
    level: "info",
    message: "started",
    time: "2026-08-20T10:00:00.000Z",
  });
});

test("extractDigest reads a digest property off an error-like object", () => {
  const err = Object.assign(new Error("redirect"), { digest: "NEXT_REDIRECT;push;/login;307" });
  assert.equal(extractDigest(err), "NEXT_REDIRECT;push;/login;307");
});

test("extractDigest returns undefined for a plain Error with no digest", () => {
  assert.equal(extractDigest(new Error("plain")), undefined);
});

test("extractDigest returns undefined for a non-object thrown value", () => {
  assert.equal(extractDigest("just a string"), undefined);
  assert.equal(extractDigest(null), undefined);
});

test("isExpectedNextControlFlowDigest recognizes redirect and not-found digests", () => {
  assert.equal(isExpectedNextControlFlowDigest("NEXT_REDIRECT;push;/login;307"), true);
  assert.equal(isExpectedNextControlFlowDigest("NEXT_HTTP_ERROR_FALLBACK;404"), true);
});

test("isExpectedNextControlFlowDigest rejects a real error digest and undefined", () => {
  assert.equal(isExpectedNextControlFlowDigest("some-real-error-digest"), false);
  assert.equal(isExpectedNextControlFlowDigest(undefined), false);
});
