"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { allocateNextTokenNumber } from "@/lib/queue/tokenNumbering";
import { getPatientSession } from "@/lib/auth/patient";

export interface BookingState {
  error?: string;
}

const MAX_TOKENS_PER_PHONE_PER_SESSION = 3;

const bookingSchema = z.object({
  sessionId: z.string().min(1),
  patientName: z.string().trim().min(1),
  patientPhone: z.string().trim().min(6),
});

export async function selfBookToken(_prevState: BookingState, formData: FormData): Promise<BookingState> {
  const parsed = bookingSchema.safeParse({
    sessionId: formData.get("sessionId"),
    patientName: formData.get("patientName"),
    patientPhone: formData.get("patientPhone"),
  });
  if (!parsed.success) {
    return { error: "Enter your name and phone number." };
  }

  const session = await prisma.session.findUnique({ where: { id: parsed.data.sessionId } });
  if (!session) {
    return { error: "Session not found." };
  }
  if (session.status !== "OPEN" && session.status !== "IN_PROGRESS") {
    return { error: "This session is not currently accepting bookings." };
  }

  // Opportunistic link to a Patient account for the medical-record
  // feature (see Phase 8): prefer the logged-in patient session over the
  // typed phone number, since the session is the authoritative identity;
  // fall back to a phone match so an anonymous booking by an already
  // -registered patient still lands in their own record timeline. Booking
  // itself stays fully anonymous-capable — this never creates an account.
  const patientSession = await getPatientSession();

  let publicId: string;
  try {
    publicId = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.token.count({
        where: {
          sessionId: session.id,
          patientPhoneSnapshot: parsed.data.patientPhone,
          status: { not: "CANCELLED" },
        },
      });
      if (existingCount >= MAX_TOKENS_PER_PHONE_PER_SESSION) {
        throw new Error("RATE_LIMITED");
      }

      const tokenNumber = await allocateNextTokenNumber(tx, session.id);
      const newPublicId = nanoid();
      const now = new Date();

      const linkedPatientId = patientSession
        ? patientSession.patientId
        : (await tx.patient.findUnique({ where: { phone: parsed.data.patientPhone } }))?.id;

      const token = await tx.token.create({
        data: {
          sessionId: session.id,
          publicId: newPublicId,
          tokenNumber,
          patientId: linkedPatientId,
          patientNameSnapshot: parsed.data.patientName,
          patientPhoneSnapshot: parsed.data.patientPhone,
          source: "SELF_BOOK",
          status: "BOOKED",
          issuedAt: now,
        },
      });

      await tx.queueEvent.create({
        data: {
          sessionId: session.id,
          tokenId: token.id,
          type: "TOKEN_ISSUED",
          occurredAt: now,
        },
      });

      return newPublicId;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "RATE_LIMITED") {
      return { error: "You've already booked the maximum number of tokens for this session from this phone number." };
    }
    throw err;
  }

  redirect(`/t/${publicId}`);
}
