import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidSessionTransition, sessionTransitionEventType } from "./sessionTransitions";
import type { SessionStatus } from "@/generated/prisma/enums";

const ALL_STATUSES: SessionStatus[] = ["SCHEDULED", "OPEN", "IN_PROGRESS", "PAUSED", "CLOSED"];

const VALID_PAIRS: [SessionStatus, SessionStatus][] = [
  ["SCHEDULED", "OPEN"],
  ["OPEN", "IN_PROGRESS"],
  ["IN_PROGRESS", "PAUSED"],
  ["IN_PROGRESS", "CLOSED"],
  ["PAUSED", "IN_PROGRESS"],
];

test("every documented transition is valid", () => {
  for (const [from, to] of VALID_PAIRS) {
    assert.equal(isValidSessionTransition(from, to), true, `${from} -> ${to} should be valid`);
  }
});

test("every other transition is rejected, including same-state and skipping steps", () => {
  const validSet = new Set(VALID_PAIRS.map(([f, t]) => `${f}->${t}`));
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      if (validSet.has(`${from}->${to}`)) continue;
      assert.equal(isValidSessionTransition(from, to), false, `${from} -> ${to} should be rejected`);
    }
  }
});

test("SCHEDULED cannot jump straight to CLOSED", () => {
  assert.equal(isValidSessionTransition("SCHEDULED", "CLOSED"), false);
});

test("OPEN cannot jump straight to CLOSED, skipping IN_PROGRESS", () => {
  assert.equal(isValidSessionTransition("OPEN", "CLOSED"), false);
});

test("CLOSED has no valid outgoing transitions", () => {
  for (const to of ALL_STATUSES) {
    assert.equal(isValidSessionTransition("CLOSED", to), false);
  }
});

test("sessionTransitionEventType maps PAUSED -> IN_PROGRESS to SESSION_RESUMED specifically", () => {
  assert.equal(sessionTransitionEventType("PAUSED", "IN_PROGRESS"), "SESSION_RESUMED");
});

test("sessionTransitionEventType maps the other three documented transitions", () => {
  assert.equal(sessionTransitionEventType("SCHEDULED", "OPEN"), "SESSION_OPENED");
  assert.equal(sessionTransitionEventType("IN_PROGRESS", "PAUSED"), "SESSION_PAUSED");
  assert.equal(sessionTransitionEventType("IN_PROGRESS", "CLOSED"), "SESSION_CLOSED");
});
