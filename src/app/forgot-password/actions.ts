"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { looksLikeEmail, phoneCandidates } from "@/lib/auth/identifier";
import { issueResetToken, resetLink, ACCOUNT_KIND_LABEL } from "@/lib/auth/passwordReset";
import { sendMail, isMailConfigured } from "@/lib/mailer";
import type { AccountKind } from "@/generated/prisma/enums";

export interface ForgotPasswordState {
  sent?: boolean;
  error?: string;
}

const schema = z.object({ identifier: z.string().trim().min(1) });

interface ResetTarget {
  kind: AccountKind;
  accountId: string;
  email: string;
}

// Mirrors the unified login: whatever identifies you there identifies you
// here. A phone-only patient is the one case that cannot be served — the
// reset link has to go somewhere, and this app has no SMS provider — which
// is why the form asks for an email address specifically and says so.
async function findTargets(identifier: string): Promise<ResetTarget[]> {
  const targets: ResetTarget[] = [];

  if (looksLikeEmail(identifier)) {
    const emails = [...new Set([identifier, identifier.toLowerCase()])];
    const [admin, staff, patient] = await Promise.all([
      prisma.platformAdmin.findFirst({ where: { email: { in: emails }, isActive: true }, select: { id: true, email: true } }),
      prisma.staffUser.findFirst({ where: { email: { in: emails }, isActive: true }, select: { id: true, email: true } }),
      prisma.patient.findFirst({ where: { email: { in: emails } }, select: { id: true, email: true } }),
    ]);
    if (admin) targets.push({ kind: "ADMIN", accountId: admin.id, email: admin.email });
    if (staff) targets.push({ kind: "STAFF", accountId: staff.id, email: staff.email });
    if (patient?.email) targets.push({ kind: "PATIENT", accountId: patient.id, email: patient.email });
    return targets;
  }

  // A phone number still resolves — but only to an account that recorded an
  // email as well, since that is the only channel available.
  const candidates = phoneCandidates(identifier);
  if (candidates.length === 0) return targets;
  const patient = await prisma.patient.findFirst({
    where: { phone: { in: candidates } },
    select: { id: true, email: true },
  });
  if (patient?.email) targets.push({ kind: "PATIENT", accountId: patient.id, email: patient.email });
  return targets;
}

// Always the same answer, whether or not an account was found. A password
// reset form that says "no such account" is a free account-enumeration
// endpoint, and on a health platform the mere fact that an address has an
// account is itself information about a person.
const NEUTRAL_RESULT: ForgotPasswordState = { sent: true };

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = schema.safeParse({ identifier: formData.get("identifier") });
  if (!parsed.success) {
    return { error: "Enter the email address or phone number on your account." };
  }

  // Refuse rather than silently drop the request: telling someone their
  // link is on the way when no mail transport exists is the one failure
  // mode that leaves them waiting forever.
  if (!isMailConfigured() && process.env.NODE_ENV === "production") {
    return { error: "Password reset email is not available right now. Please contact your clinic or ApnaHealth support." };
  }

  const targets = await findTargets(parsed.data.identifier);
  if (targets.length === 0) {
    return NEUTRAL_RESULT;
  }

  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");
  const requestedIp = forwarded?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || null;
  const origin = requestHeaders.get("origin") || `https://${requestHeaders.get("host") ?? "localhost:3000"}`;
  const now = new Date();

  for (const target of targets) {
    // Any earlier link for this account stops working the moment a new one
    // is requested, so a forwarded or shoulder-surfed old email is dead.
    await prisma.passwordResetToken.updateMany({
      where: { kind: target.kind, accountId: target.accountId, usedAt: null },
      data: { usedAt: now },
    });

    const issued = issueResetToken(now);
    await prisma.passwordResetToken.create({
      data: {
        kind: target.kind,
        accountId: target.accountId,
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
        requestedIp,
      },
    });

    const result = await sendMail({
      to: target.email,
      subject: "Reset your ApnaHealth password",
      text: [
        `Someone asked to reset the password on your ${ACCOUNT_KIND_LABEL[target.kind]} at ApnaHealth.`,
        "",
        "Open this link to choose a new password. It works once and expires in one hour:",
        resetLink(origin, issued.token),
        "",
        "If this wasn't you, you can ignore this email — your password has not changed.",
      ].join("\n"),
    });

    if (!result.delivered) {
      // Server console only, and only the reason — never the address or
      // the link.
      console.error(`Password reset email failed: ${result.reason ?? "unknown error"}`);
    }
  }

  // Housekeeping, not a scheduled job: expired grants are useless and this
  // is the only endpoint that creates them, so it is a natural place to
  // clear them out.
  await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - RETENTION_MS) } } });

  return NEUTRAL_RESULT;
}

// Expired rows are kept a day past expiry so a support question ("did the
// email actually go out?") can still be answered from requestedIp/createdAt
// without the token itself ever being recoverable.
const RETENTION_MS = 24 * 60 * 60 * 1000;
