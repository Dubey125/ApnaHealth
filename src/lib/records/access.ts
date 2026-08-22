import type { TokenStatus } from "@/generated/prisma/enums";

const RECORDABLE_STATUSES: TokenStatus[] = ["IN_CONSULT", "COMPLETED"];

// A consultation record only makes sense once the consult has actually
// started — BOOKED/CHECKED_IN tokens haven't been seen yet, and
// CANCELLED/NO_SHOW tokens never will be.
export function isRecordableTokenStatus(status: TokenStatus): boolean {
  return RECORDABLE_STATUSES.includes(status);
}

// Blank textarea submissions should store as unset (null), not as an
// empty string, so the record UI can tell "not documented" from "typed
// then cleared".
export function emptyToUndefined(value: string | undefined | null): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}
