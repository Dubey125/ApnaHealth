"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePatientSession } from "@/lib/auth/patient";

export interface CancelAppointmentState {
  error?: string;
}

const schema = z.object({ publicId: z.string().min(1) });

const CANCELLABLE_STATUSES = ["BOOKED", "CHECKED_IN"] as const;

/**
 * Cancel one of the signed-in patient's own appointments.
 *
 * Deliberately NOT the same action as /t/[publicId]'s cancelToken. That one
 * authorises on possession of the ticket's public id alone, which is the
 * right model for the ticket page: a walk-in patient has no account, and
 * the link is the only thing they hold. But this action runs inside an
 * authenticated area, where the session is available and a stronger check
 * costs nothing — so the token is looked up scoped BY patientId rather than
 * looked up and then trusted.
 *
 * The scoping is in the `where`, not in a check after the read: a findUnique
 * followed by an `if (token.patientId !== session.patientId)` is the shape
 * that quietly stops working the day someone refactors the early return.
 */
export async function cancelMyAppointment(
  _prevState: CancelAppointmentState,
  formData: FormData,
): Promise<CancelAppointmentState> {
  const session = await requirePatientSession();

  const parsed = schema.safeParse({ publicId: formData.get("publicId") });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const token = await prisma.token.findFirst({
    where: { publicId: parsed.data.publicId, patientId: session.patientId },
    select: { id: true, sessionId: true, publicId: true, status: true },
  });
  // One message for "no such token" and "not yours" on purpose: telling the
  // difference would confirm that a given ticket id exists.
  if (!token) {
    return { error: "Appointment not found." };
  }
  if (!CANCELLABLE_STATUSES.includes(token.status as (typeof CANCELLABLE_STATUSES)[number])) {
    return { error: "This appointment can no longer be cancelled." };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.token.update({ where: { id: token.id }, data: { status: "CANCELLED" } }),
    // QueueEvent is append-only and is what the clinic's console and audit
    // trail read, so a patient-initiated cancellation has to land in the
    // same log a front-desk one would.
    prisma.queueEvent.create({
      data: { sessionId: token.sessionId, tokenId: token.id, type: "CANCELLED", occurredAt: now },
    }),
  ]);

  revalidatePath("/patient/appointments");
  revalidatePath(`/t/${token.publicId}`);
  return {};
}
