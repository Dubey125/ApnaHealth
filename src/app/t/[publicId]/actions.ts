"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

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
