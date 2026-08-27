import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AccountKind } from "@/generated/prisma/enums";

// A reset grant is a 32-byte random value handed to exactly one person via
// email. Only its SHA-256 hash is stored, for the same reason passwords are
// hashed: whoever can read the database must not be able to take over
// accounts with what they find there. SHA-256 rather than bcrypt is correct
// here — unlike a password this is full-entropy random, so there is nothing
// for an offline attacker to guess at, and the lookup has to be fast.
const TOKEN_BYTES = 32;

// One hour. Long enough to survive a slow inbox, short enough that a reset
// link sitting in a shared or forwarded mailbox stops being a live key by
// the end of the working session it was requested in.
export const RESET_TTL_MS = 60 * 60 * 1000;

export interface IssuedResetToken {
  /** Goes in the emailed link. Never stored, never logged. */
  token: string;
  /** Stored. */
  tokenHash: string;
  expiresAt: Date;
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function issueResetToken(now: Date = new Date()): IssuedResetToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(now.getTime() + RESET_TTL_MS),
  };
}

export interface StoredResetToken {
  expiresAt: Date;
  usedAt: Date | null;
}

// Single-use and time-limited, checked together so a caller cannot forget
// one of the two. Kept pure so both conditions are directly testable
// without a database.
export function isResetTokenUsable(stored: StoredResetToken, now: Date = new Date()): boolean {
  if (stored.usedAt !== null) return false;
  return stored.expiresAt.getTime() > now.getTime();
}

// Constant-time equality for the hash comparison. The hash is looked up by
// unique index rather than scanned, so this mostly guards the belt-and-
// braces re-check at the point of use.
export function resetTokenMatches(candidateToken: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashResetToken(candidateToken), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

export function resetLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  PATIENT: "patient account",
  STAFF: "clinic account",
  ADMIN: "ApnaHealth admin account",
};
