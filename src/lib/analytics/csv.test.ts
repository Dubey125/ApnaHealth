import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "./csv";

test("toCsv returns an empty string for no rows", () => {
  assert.equal(toCsv([]), "");
});

test("toCsv renders a header row from the first row's keys, then one line per row", () => {
  const csv = toCsv([
    { status: "COMPLETED", tokenNumber: 1 },
    { status: "NO_SHOW", tokenNumber: 2 },
  ]);
  assert.equal(csv, "status,tokenNumber\r\nCOMPLETED,1\r\nNO_SHOW,2");
});

test("toCsv quotes fields containing a comma", () => {
  assert.equal(toCsv([{ note: "a, b" }]), 'note\r\n"a, b"');
});

test("toCsv quotes fields containing a double quote and doubles the internal quote", () => {
  assert.equal(toCsv([{ note: 'say "hi"' }]), 'note\r\n"say ""hi"""');
});

test("toCsv quotes fields containing a newline", () => {
  assert.equal(toCsv([{ note: "line1\nline2" }]), 'note\r\n"line1\nline2"');
});

test("toCsv leaves plain alphanumeric fields unquoted", () => {
  assert.equal(toCsv([{ status: "COMPLETED" }]), "status\r\nCOMPLETED");
});
