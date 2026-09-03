"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getPatientSession } from "@/lib/auth/patient";

export interface CancelState {
  error?: string;
}

const cancelSchema = z.object({
  publicId: z.string().min(1),
});

const CANCELLABLE_STATUSES = ["BOOKED", "CHECKED_IN"] as const;

export async function cancelToken(_prevState: CancelState, formData: FormData): Promise<CancelState> {
  const parsed = cancelSchema.safeParse({ publicId: formData.get("publicId") });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const token = await prisma.token.findUnique({ where: { publicId: parsed.data.publicId } });
  if (!token) {
    return { error: "Ticket not found." };
  }

  // Who is allowed to cancel from this page.
  //
  // /t/[publicId] is deliberately public: a walk-in patient has no account,
  // and the printed slip or forwarded link is the only thing they hold. So
  // for a token with no owner, possession of the id IS the credential, and
  // that is the right model.
  //
  // But TicketActions actively encourages sharing this link on WhatsApp so
  // family can watch the queue — which means for a token that DOES belong
  // to an account, "anyone with the link" is everyone in a group chat, and
  // any of them could cancel the appointment. Watching and cancelling are
  // not the same permission.
  //
  // So an owned token can only be cancelled by its owner, signed in. The
  // ticket page routes them to the appointment centre, which does exactly
  // that (see /patient/appointments/actions.ts).
  if (token.patientId !== null) {
    const session = await getPatientSession();
    if (session?.patientId !== token.patientId) {
      return {
        error:
          "This appointment is linked to a patient account. Sign in and cancel it from My appointments.",
      };
    }
  }

  if (!CANCELLABLE_STATUSES.includes(token.status as (typeof CANCELLABLE_STATUSES)[number])) {
    return { error: `This ticket can no longer be cancelled (status: ${token.status}).` };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.token.update({ where: { id: token.id }, data: { status: "CANCELLED" } }),
    prisma.queueEvent.create({
      data: { sessionId: token.sessionId, tokenId: token.id, type: "CANCELLED", occurredAt: now },
    }),
  ]);

  revalidatePath(`/t/${token.publicId}`);
  return {};
}
