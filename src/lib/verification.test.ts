import { test } from "node:test";
import assert from "node:assert/strict";
import { verificationSchema, computeVerifiedAt } from "./verification";

test("verificationSchema accepts a complete VERIFIED submission", () => {
  const result = verificationSchema.safeParse({
    doctorId: "doc1",
    status: "VERIFIED",
    registrationNumberChecked: "MCI-123456",
    sourceName: "Maharashtra Medical Council portal",
  });
  assert.equal(result.success, true);
});

test("verificationSchema rejects a submission missing registrationNumberChecked", () => {
  const result = verificationSchema.safeParse({
    doctorId: "doc1",
    status: "VERIFIED",
    registrationNumberChecked: "",
    sourceName: "Maharashtra Medical Council portal",
  });
  assert.equal(result.success, false);
});

test("verificationSchema rejects a submission missing sourceName", () => {
  const result = verificationSchema.safeParse({
    doctorId: "doc1",
    status: "REJECTED",
    registrationNumberChecked: "MCI-123456",
    sourceName: "",
  });
  assert.equal(result.success, false);
});

test("verificationSchema rejects a status outside PENDING/VERIFIED/REJECTED", () => {
  const result = verificationSchema.safeParse({
    doctorId: "doc1",
    status: "APPROVED",
    registrationNumberChecked: "MCI-123456",
    sourceName: "Maharashtra Medical Council portal",
  });
  assert.equal(result.success, false);
});

test("computeVerifiedAt returns the check time for VERIFIED", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(computeVerifiedAt("VERIFIED", now), now);
});

test("computeVerifiedAt returns null for REJECTED", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(computeVerifiedAt("REJECTED", now), null);
});

test("computeVerifiedAt returns null for PENDING", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(computeVerifiedAt("PENDING", now), null);
});
