"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { allocateNextTokenNumber } from "@/lib/queue/tokenNumbering";
import { getPatientSession } from "@/lib/auth/patient";
import { bookableSessionWhere, isBookableSessionStatus } from "@/lib/publicListing";

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

  // The facility-approval gate is enforced HERE, not inherited from the
  // page that rendered this form. /book/[sessionId] is one entry point and
  // this action is another: the page puts the session's internal id into a
  // hidden field, so anyone who has ever loaded a booking link holds an id
  // they can post back directly. Without this clause a facility that was
  // approved, shared its link and was then REJECTED kept issuing public
  // tokens through the action while its page correctly 404'd.
  //
  // findFirst with the shared bookableSessionWhere() rather than a
  // findUnique on the id alone, so the listing rules stay defined once in
  // lib/publicListing.ts.
  const session = await prisma.session.findFirst({ where: bookableSessionWhere(parsed.data.sessionId) });
  if (!session) {
    // Deliberately one message for "no such session" and "session at a
    // facility that isn't listed": telling them apart would confirm that
    // an unapproved or rejected facility exists.
    return { error: "This session isn't available for booking." };
  }
  // Status is checked after the listing gate, so this friendlier wording
  // is only ever reached for a session the public is allowed to see.
  if (!isBookableSessionStatus(session.status)) {
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
