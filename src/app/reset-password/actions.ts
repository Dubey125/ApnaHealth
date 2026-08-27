"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { hashResetToken, isResetTokenUsable, resetTokenMatches } from "@/lib/auth/passwordReset";
import { clearStaffSession } from "@/lib/auth/staff";
import { clearPatientSession } from "@/lib/auth/patient";
import { clearAdminSession } from "@/lib/auth/admin";

export interface ResetPasswordState {
  error?: string;
}

const schema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8),
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.password === v.confirmPassword, { message: "Passwords do not match" });

// The token arrives from a URL the user was emailed, so it is untrusted
// input like any other: parsed with Zod, looked up by hash (the plaintext
// is never stored), and re-checked for single use and expiry inside the
// same transaction that consumes it — so two clicks on the same link cannot
// both succeed.
export async function resetPassword(_prevState: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((issue) => issue.message === "Passwords do not match");
    return { error: mismatch ? "Those two passwords don't match." : "Choose a password of at least 8 characters." };
  }

  const stored = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(parsed.data.token) },
  });
  const expired = "That reset link is no longer valid. Request a new one.";
  if (!stored || !resetTokenMatches(parsed.data.token, stored.tokenHash) || !isResetTokenUsable(stored)) {
    return { error: expired };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const now = new Date();

  const consumed = await prisma.$transaction(async (tx) => {
    // Consume first, and only where it is still unused: if a second
    // submission of the same link races this one, its updateMany matches
    // zero rows and it stops here rather than setting a second password.
    const claim = await tx.passwordResetToken.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claim.count === 0) return false;

    if (stored.kind === "ADMIN") {
      await tx.platformAdmin.update({ where: { id: stored.accountId }, data: { passwordHash } });
    } else if (stored.kind === "STAFF") {
      await tx.staffUser.update({ where: { id: stored.accountId }, data: { passwordHash } });
    } else {
      await tx.patient.update({ where: { id: stored.accountId }, data: { passwordHash } });
    }

    // Any other outstanding link for the same account dies with this one.
    await tx.passwordResetToken.updateMany({
      where: { kind: stored.kind, accountId: stored.accountId, usedAt: null },
      data: { usedAt: now },
    });
    return true;
  });

  if (!consumed) {
    return { error: expired };
  }

  // Whoever completes a reset starts clean. Sessions are stateless JWTs, so
  // an already-issued cookie elsewhere cannot be revoked from here — but
  // clearing this browser's three cookies means the person who just reset
  // is not left holding a session that predates it.
  await Promise.all([clearStaffSession(), clearPatientSession(), clearAdminSession()]);

  redirect("/login?reset=1");
}
