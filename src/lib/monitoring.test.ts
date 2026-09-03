import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, fingerprintError, shouldReport, type WindowState } from "./monitoring";

function store(): WindowState {
  return { windowStartMs: 0, seen: new Map(), sent: 0 };
}

test("the same error is reported once, however often it recurs", () => {
  const s = store();
  const now = 1_000_000;
  assert.equal(shouldReport("boom", now, s), true, "first occurrence is reported");
  for (let i = 0; i < 50; i += 1) {
    assert.equal(shouldReport("boom", now + i, s), false, "repeats are collapsed");
  }
});

test("different errors are each reported", () => {
  const s = store();
  assert.equal(shouldReport("a", 1_000, s), true);
  assert.equal(shouldReport("b", 1_000, s), true);
  assert.equal(shouldReport("c", 1_000, s), true);
});

test("a new window lets a recurring error be reported again", () => {
  const s = store();
  const now = 1_000_000;
  assert.equal(shouldReport("boom", now, s), true);
  assert.equal(shouldReport("boom", now + 60_000, s), false, "still inside the window");
  assert.equal(shouldReport("boom", now + 5 * 60_000 + 1, s), true, "next window reports it again");
});

// A storm of distinct errors must not become a flood of webhooks.
test("distinct errors are capped per window", () => {
  const s = store();
  const now = 1_000_000;
  let reported = 0;
  for (let i = 0; i < 100; i += 1) {
    if (shouldReport(`error-${i}`, now, s)) reported += 1;
  }
  assert.equal(reported, 20, "expected the per-window ceiling");
});

test("the same error occurring twice fingerprints identically", () => {
  // One error object, fingerprinted twice — which is the real scenario: the
  // same throw site firing on two requests. Two `new Error(...)` calls on
  // two source lines are genuinely two different sites and should differ.
  const error = new Error("Database unreachable");
  assert.equal(
    fingerprintError(error, { path: "/doctors" }),
    fingerprintError(error, { path: "/doctors" }),
  );
});

test("a fingerprint never carries a source path", () => {
  const fingerprint = fingerprintError(new Error("Database unreachable"), { path: "/doctors" });
  assert.match(fingerprint, /^[0-9a-f]{16}$/, "expected an opaque hash");
  assert.ok(!fingerprint.includes(".ts"), "a source path reached the fingerprint");
  assert.ok(!fingerprint.includes("ApnaHealth"), "the server filesystem layout reached the fingerprint");
});

test("the same message on different routes fingerprints differently", () => {
  const doctors = fingerprintError(new Error("Database unreachable"), { path: "/doctors" });
  const clinics = fingerprintError(new Error("Database unreachable"), { path: "/clinics" });
  assert.notEqual(doctors, clinics);
});

// The payload leaves our infrastructure, so what it carries matters.
test("a report carries the message and context but never a stack", () => {
  const error = new Error("Something failed");
  const report = buildReport(error, { path: "/doctors", method: "GET" }, new Date("2026-09-01T12:00:00Z"));

  assert.equal(report.message, "Something failed");
  assert.deepEqual(report.context, { path: "/doctors", method: "GET" });
  assert.equal(report.occurredAt, "2026-09-01T12:00:00.000Z");

  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes("at Object"), "a stack frame reached the payload");
  assert.ok(!serialized.includes(".ts:"), "a source location reached the payload");
});

test("a non-Error thrown value still produces a usable report", () => {
  const report = buildReport("just a string", undefined, new Date());
  assert.equal(report.message, "just a string");
  assert.ok(report.fingerprint.length > 0);
});
