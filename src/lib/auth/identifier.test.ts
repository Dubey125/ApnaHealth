import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeEmail, phoneCandidates } from "./identifier";

test("looksLikeEmail accepts an email address", () => {
  assert.equal(looksLikeEmail("owner@clinic.in"), true);
});

test("looksLikeEmail rejects phone numbers, however they are spelled", () => {
  assert.equal(looksLikeEmail("9876543210"), false);
  assert.equal(looksLikeEmail("+91 98765 43210"), false);
});

test("phoneCandidates matches the same number however it was spelled at signup", () => {
  const spellings = ["9876543210", "98765 43210", "+919876543210", "+91 98765 43210"];
  for (const typed of spellings) {
    const candidates = phoneCandidates(typed);
    for (const stored of spellings) {
      assert.ok(candidates.includes(stored), `${typed} should resolve to ${stored}`);
    }
  }
});

test("phoneCandidates never invents digits", () => {
  for (const candidate of phoneCandidates("+91 98765 43210")) {
    assert.match(candidate.replace(/\D/g, ""), /^(91)?9876543210$/);
  }
});

test("phoneCandidates leaves a non-Indian number alone apart from separators", () => {
  assert.deepEqual(phoneCandidates("+1 415 555 0100").sort(), ["+1 415 555 0100", "14155550100"]);
});

test("phoneCandidates returns nothing for input with no digits", () => {
  assert.deepEqual(phoneCandidates("   "), []);
});
