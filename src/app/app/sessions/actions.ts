"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { requireStaffSession, assertClinicAccess } from "@/lib/auth/staff";
import { isValidSessionTransition, sessionTransitionEventType } from "@/lib/queue/sessionTransitions";
import { loadSessionForStaff } from "@/lib/queue/staffSessionAccess";

export interface SessionFormState {
  error?: string;
}

const createSessionSchema = z.object({
  // Optional because a DOCTOR never supplies it — their own doctorId is
  // taken from the session instead (see below).
  doctorId: z.string().min(1).optional(),
  sessionDate: z.string().min(1),
  plannedStartAt: z.string().min(1),
  plannedEndAt: z.string().min(1),
  locationLabel: z.string().trim().min(1),
});

// Widened from OWNER-only to also allow DOCTOR, for their OWN sessions
// only. ACCESS_MATRIX.md's "Create session" row is updated alongside this
// (Doctor: ✅ own sessions) rather than silently diverging from it.
//
// The doctor's own doctorId comes from the verified session cookie and the
// submitted `doctorId` field is ignored entirely for that role — so a
// doctor cannot schedule a session onto a colleague's calendar by editing
// the form. Owners keep picking any doctor in their clinic.
export async function createSession(_prevState: SessionFormState, formData: FormData): Promise<SessionFormState> {
  const session = await requireStaffSession("OWNER", "DOCTOR");

  const parsed = createSessionSchema.safeParse({
    doctorId: formData.get("doctorId") || undefined,
    sessionDate: formData.get("sessionDate"),
    plannedStartAt: formData.get("plannedStartAt"),
    plannedEndAt: formData.get("plannedEndAt"),
    locationLabel: formData.get("locationLabel"),
  });
  if (!parsed.success) {
    return { error: "Fill in date, start/end time and a location." };
  }

  const targetDoctorId = session.role === "DOCTOR" ? session.doctorId : parsed.data.doctorId;
  if (!targetDoctorId) {
    return {
      error:
        session.role === "DOCTOR"
          ? "This staff account is not linked to a doctor profile."
          : "Select which doctor this session is for.",
    };
  }

  const doctor = await prisma.doctor.findUnique({ where: { id: targetDoctorId } });
  if (!doctor) {
    return { error: "Doctor not found." };
  }
  assertClinicAccess(session, doctor.clinicId);

  const plannedStartAt = new Date(`${parsed.data.sessionDate}T${parsed.data.plannedStartAt}:00`);
  const plannedEndAt = new Date(`${parsed.data.sessionDate}T${parsed.data.plannedEndAt}:00`);
  if (Number.isNaN(plannedStartAt.getTime()) || Number.isNaN(plannedEndAt.getTime()) || plannedEndAt <= plannedStartAt) {
    return { error: "Enter a valid date and an end time after the start time." };
  }

  const now = new Date();
  const created = await prisma.session.create({
    data: {
      clinicId: session.clinicId,
      doctorId: doctor.id,
      publicId: nanoid(),
      sessionDate: new Date(`${parsed.data.sessionDate}T00:00:00`),
      plannedStartAt,
      plannedEndAt,
      locationLabel: parsed.data.locationLabel,
    },
  });

  // Now that two different roles can create sessions, who scheduled what
  // is worth recording — same AuditEvent pattern as doctor creation and
  // verification.
  await prisma.auditEvent.create({
    data: {
      clinicId: session.clinicId,
      actorUserId: session.staffUserId,
      action: "SESSION_CREATED",
      entityType: "Session",
      entityId: created.id,
      occurredAt: now,
      metadata: { doctorName: doctor.name, locationLabel: parsed.data.locationLabel },
    },
  });

  // A DOCTOR has no access to /app/sessions (OWNER/FRONT_DESK only), so
  // sending them there would bounce them straight to /login.
  redirect(session.role === "DOCTOR" ? "/app/doctor/schedule" : "/app/sessions");
}

const transitionSchema = z.object({
  sessionId: z.string().min(1),
  toStatus: z.enum(["SCHEDULED", "OPEN", "IN_PROGRESS", "PAUSED", "CLOSED"]),
  // Which screen triggered this — pause/resume/close belongs on the
  // front-desk queue screen too (ACCESS_MATRIX.md: queue management,
  // unlike session creation, isn't owner-only), so the action needs to
  // return the caller to wherever they came from.
  returnTo: z.enum(["/app/sessions", "queue"]),
});

// Shared by /app/sessions (owner's admin view) and /app/queue/[sessionId]
// (front-desk/doctor's operational view) — both use the same
// loadSessionForStaff authorization (OWNER, FRONT_DESK, or DOCTOR on
// their own session).
export async function transitionSession(_prevState: SessionFormState, formData: FormData): Promise<SessionFormState> {
  const parsed = transitionSchema.safeParse({
    sessionId: formData.get("sessionId"),
    toStatus: formData.get("toStatus"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const { session, clinicSession } = await loadSessionForStaff(parsed.data.sessionId);

  if (!isValidSessionTransition(clinicSession.status, parsed.data.toStatus)) {
    return { error: `Cannot move a session from ${clinicSession.status} to ${parsed.data.toStatus}.` };
  }

  const eventType = sessionTransitionEventType(clinicSession.status, parsed.data.toStatus);
  const now = new Date();

  await prisma.$transaction([
    prisma.session.update({
      where: { id: clinicSession.id },
      data: {
        status: parsed.data.toStatus,
        ...(parsed.data.toStatus === "IN_PROGRESS" && clinicSession.actualStartAt === null ? { actualStartAt: now } : {}),
        ...(parsed.data.toStatus === "CLOSED" ? { actualEndAt: now } : {}),
      },
    }),
    prisma.queueEvent.create({
      data: {
        sessionId: clinicSession.id,
        actorStaffUserId: session.staffUserId,
        type: eventType,
        occurredAt: now,
      },
    }),
  ]);

  redirect(parsed.data.returnTo === "queue" ? `/app/queue/${clinicSession.id}` : "/app/sessions");
}
