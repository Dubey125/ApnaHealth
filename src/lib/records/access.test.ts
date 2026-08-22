import { test } from "node:test";
import assert from "node:assert/strict";
import { isRecordableTokenStatus, emptyToUndefined } from "./access";
import type { TokenStatus } from "@/generated/prisma/enums";

test("isRecordableTokenStatus allows IN_CONSULT and COMPLETED", () => {
  assert.equal(isRecordableTokenStatus("IN_CONSULT"), true);
  assert.equal(isRecordableTokenStatus("COMPLETED"), true);
});

test("isRecordableTokenStatus rejects tokens that haven't started or won't", () => {
  const notRecordable: TokenStatus[] = ["BOOKED", "CHECKED_IN", "CANCELLED", "NO_SHOW"];
  for (const status of notRecordable) {
    assert.equal(isRecordableTokenStatus(status), false);
  }
});

test("emptyToUndefined trims and passes through non-blank text", () => {
  assert.equal(emptyToUndefined("  Fever for 3 days  "), "Fever for 3 days");
});

test("emptyToUndefined treats blank, whitespace-only, undefined and null as unset", () => {
  assert.equal(emptyToUndefined(""), undefined);
  assert.equal(emptyToUndefined("   "), undefined);
  assert.equal(emptyToUndefined(undefined), undefined);
  assert.equal(emptyToUndefined(null), undefined);
});
