import { prisma } from "@/lib/db";
import { requireStaffSession, assertClinicAccess, type StaffSession } from "@/lib/auth/staff";
import type { Session } from "@/generated/prisma/client";

// Shared by every queue-management server action (walk-in, check-in, done
// — call next, no-show, staff cancel, pause/resume/close): confirms the
// caller is staff with a queue-management role, the session belongs to
// their clinic, and — for a DOCTOR-role account — that it's their own
// session (ACCESS_MATRIX.md: "Manage queue ... Doctor: own sessions").
export async function loadSessionForStaff(
  sessionId: string,
): Promise<{ session: StaffSession; clinicSession: Session }> {
  const session = await requireStaffSession("OWNER", "FRONT_DESK", "DOCTOR");
  const clinicSession = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!clinicSession) {
    throw new Error("Session not found.");
  }
  assertClinicAccess(session, clinicSession.clinicId);
  if (session.role === "DOCTOR" && session.doctorId !== clinicSession.doctorId) {
    throw new Error("You can only manage your own sessions.");
  }
  return { session, clinicSession };
}
