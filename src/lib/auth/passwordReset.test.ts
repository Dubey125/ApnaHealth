import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RESET_TTL_MS,
  hashResetToken,
  isResetTokenUsable,
  issueResetToken,
  resetLink,
  resetTokenMatches,
} from "./passwordReset";

test("issueResetToken never returns the same token twice", () => {
  const tokens = new Set(Array.from({ length: 200 }, () => issueResetToken().token));
  assert.equal(tokens.size, 200);
});

test("issueResetToken stores a hash, not the token itself", () => {
  const issued = issueResetToken();
  assert.ok(!issued.tokenHash.includes(issued.token));
  assert.equal(issued.tokenHash, hashResetToken(issued.token));
});

test("issueResetToken expires one hour out", () => {
  const now = new Date("2026-08-26T10:00:00.000Z");
  assert.equal(issueResetToken(now).expiresAt.getTime() - now.getTime(), RESET_TTL_MS);
});

test("a reset token is URL safe", () => {
  const { token } = issueResetToken();
  assert.equal(encodeURIComponent(token), token);
});

test("isResetTokenUsable accepts an unused, unexpired token", () => {
  const now = new Date("2026-08-26T10:00:00.000Z");
  assert.equal(isResetTokenUsable({ expiresAt: new Date(now.getTime() + 1000), usedAt: null }, now), true);
});

test("isResetTokenUsable rejects an expired token", () => {
  const now = new Date("2026-08-26T10:00:00.000Z");
  assert.equal(isResetTokenUsable({ expiresAt: new Date(now.getTime() - 1), usedAt: null }, now), false);
});

test("isResetTokenUsable rejects a token that was already used", () => {
  const now = new Date("2026-08-26T10:00:00.000Z");
  assert.equal(isResetTokenUsable({ expiresAt: new Date(now.getTime() + 1000), usedAt: now }, now), false);
});

test("resetTokenMatches matches its own hash and nothing else", () => {
  const a = issueResetToken();
  const b = issueResetToken();
  assert.equal(resetTokenMatches(a.token, a.tokenHash), true);
  assert.equal(resetTokenMatches(b.token, a.tokenHash), false);
});

test("resetTokenMatches does not throw on a malformed stored hash", () => {
  assert.equal(resetTokenMatches(issueResetToken().token, "not-a-hash"), false);
});

test("resetLink does not double the slash on an origin with a trailing one", () => {
  assert.equal(resetLink("https://apnahealth.in/", "abc"), "https://apnahealth.in/reset-password?token=abc");
});
