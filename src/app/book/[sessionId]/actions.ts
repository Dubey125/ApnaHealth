"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/db";
import { loadEntitlements } from "@/lib/billing/load";
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
  reasonForVisit: z.string().trim().optional(),
  // Only the two a patient can answer for themselves — see
  // src/lib/queue/visitTypes.ts for why PROCEDURE is not offered here.
  visitType: z.enum(["NEW", "FOLLOW_UP"]).optional(),
});

export async function selfBookToken(_prevState: BookingState, formData: FormData): Promise<BookingState> {
  const parsed = bookingSchema.safeParse({
    sessionId: formData.get("sessionId"),
    patientName: formData.get("patientName"),
    patientPhone: formData.get("patientPhone"),
    reasonForVisit: formData.get("reasonForVisit") || undefined,
    visitType: formData.get("visitType") || undefined,
  });
  if (!parsed.success) {
    return { error: "Enter your name and phone number." };
  }

  const session = await prisma.session.findFirst({ where: bookableSessionWhere(parsed.data.sessionId) });
  if (!session) {
    return { error: "This session isn't available for booking." };
  }
  if (!isBookableSessionStatus(session.status)) {
    return { error: "This session is not currently accepting bookings." };
  }

  // Same rule as the counter: a token is a new promise to a patient, so a
  // lapsed subscription stops it being made. Deliberately phrased without
  // exposing the clinic's billing status to the public — a patient is not
  // party to that relationship and does not need to know why.
  const entitlements = await loadEntitlements(session.clinicId);
  if (!entitlements.canIssueTokens) {
    return { error: "This clinic isn't accepting online bookings right now. Please call the clinic directly." };
  }

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
          reasonForVisit: parsed.data.reasonForVisit ?? null,
          visitType: parsed.data.visitType ?? "UNSPECIFIED",
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
