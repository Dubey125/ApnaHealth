import { z } from "zod";
import type { VerificationStatus } from "@/generated/prisma/enums";

export const verificationSchema = z.object({
  doctorId: z.string().min(1),
  status: z.enum(["PENDING", "VERIFIED", "REJECTED"]),
  registrationNumberChecked: z.string().trim().min(1),
  sourceName: z.string().trim().min(1),
  sourceReference: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
});

// verifiedAt reflects "currently verified as of", not "last checked at" —
// so it's only set while status is VERIFIED, and cleared otherwise (e.g.
// a later REJECTED means the doctor is no longer currently verified, even
// though the check history still shows the earlier VERIFIED entry).
export function computeVerifiedAt(status: VerificationStatus, now: Date): Date | null {
  return status === "VERIFIED" ? now : null;
}
