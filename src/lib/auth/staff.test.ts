import { test } from "node:test";
import assert from "node:assert/strict";
import { hasRequiredRole, assertClinicAccess } from "./staff";
import { signSession, verifySession } from "./session";

process.env.SESSION_SECRET ??= "test-secret-not-for-production-use-only-32b";

test("hasRequiredRole allows any role when no roles are required", () => {
  assert.equal(hasRequiredRole({ role: "FRONT_DESK" }, []), true);
});

test("hasRequiredRole allows a session whose role is in the allowed list", () => {
  assert.equal(hasRequiredRole({ role: "OWNER" }, ["OWNER", "DOCTOR"]), true);
});

test("hasRequiredRole rejects a session whose role is not allowed (wrong role)", () => {
  assert.equal(hasRequiredRole({ role: "FRONT_DESK" }, ["OWNER"]), false);
});

test("assertClinicAccess passes when the session's clinic matches the resource", () => {
  assert.doesNotThrow(() => assertClinicAccess({ clinicId: "clinic-a" }, "clinic-a"));
});

test("assertClinicAccess throws on cross-clinic access", () => {
  assert.throws(() => assertClinicAccess({ clinicId: "clinic-a" }, "clinic-b"));
});

test("a signed staff session round-trips clinicId, role and doctorId", async () => {
  const token = await signSession({ staffUserId: "s1", clinicId: "clinic-a", role: "DOCTOR", doctorId: "d1" }, "12h");
  const payload = await verifySession<{ staffUserId: string; clinicId: string; role: string; doctorId: string }>(
    token,
  );
  assert.deepEqual(payload && { staffUserId: payload.staffUserId, clinicId: payload.clinicId, role: payload.role, doctorId: payload.doctorId }, {
    staffUserId: "s1",
    clinicId: "clinic-a",
    role: "DOCTOR",
    doctorId: "d1",
  });
});
