import type { Prisma } from "@/generated/prisma/client";

// Serializes concurrent token-number allocation for a single session using
// a Postgres transaction-scoped advisory lock, keyed off the session id.
// Two front-desk devices (or a walk-in and a self-booking) issuing tokens
// for the same session at the same instant will queue up on this lock
// rather than both computing the same "next" number.
export async function allocateNextTokenNumber(tx: Prisma.TransactionClient, sessionId: string): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))`;
  const result = await tx.token.aggregate({
    where: { sessionId },
    _max: { tokenNumber: true },
  });
  return (result._max.tokenNumber ?? 0) + 1;
}
