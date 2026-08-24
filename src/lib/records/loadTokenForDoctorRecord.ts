import { prisma } from "@/lib/db";
import { requireDoctorContext, assertClinicAccess, type StaffSession } from "@/lib/auth/staff";
import type { Session, Token } from "@/generated/prisma/client";
import { isRecordableTokenStatus } from "./access";

export interface DoctorRecordContext {
  session: StaffSession & { doctorId: string };
  clinicSession: Session;
  token: Token;
}

// Doctor-only per ACCESS_MATRIX.md ("Create consultation record": Doctor
// only): confirms the caller is a doctor, the token's session belongs to
// their own clinic and is their own session, and the token has reached a
// consult-started status.
export async function loadTokenForDoctorRecord(sessionId: string, tokenId: string): Promise<DoctorRecordContext> {
  const session = await requireDoctorContext();

  const clinicSession = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!clinicSession) {
    throw new Error("Session not found.");
  }
  assertClinicAccess(session, clinicSession.clinicId);
  if (session.doctorId !== clinicSession.doctorId) {
    throw new Error("You can only manage your own sessions.");
  }

  const token = await prisma.token.findUnique({ where: { id: tokenId } });
  if (!token || token.sessionId !== clinicSession.id) {
    throw new Error("Token not found for this session.");
  }
  if (!isRecordableTokenStatus(token.status)) {
    throw new Error("A consultation record can only be added once the consult has started.");
  }

  return { session: { ...session, doctorId: session.doctorId }, clinicSession, token };
}
