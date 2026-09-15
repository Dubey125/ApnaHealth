import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// pg's default pool size (10) isn't enough headroom for a burst of
// concurrent interactive transactions (e.g. several walk-ins issued at
// once) each holding a connection for the transaction's duration.
//
// idleTimeoutMillis is the important one on Neon: its serverless compute
// suspends after a few minutes of inactivity and drops the TCP sessions
// behind it, but pg has no way to know that — so the pool keeps handing
// out sockets the server has already closed, and the request fails
// instantly with P1001 / DatabaseNotReachable rather than reconnecting.
// Retiring idle connections well before Neon suspends means the pool
// opens a fresh one instead, which succeeds. (Observed directly: a raw
// connect took 3.7s and worked, while the app's pooled connection failed
// in 271ms.)
//
// connectionTimeoutMillis covers the other half — a genuinely cold Neon
// compute can take several seconds to wake, comfortably past the 5s
// default. Set here rather than as a connect_timeout query parameter so
// it holds regardless of how DATABASE_URL happens to be written.
//
// TEN seconds, not thirty. Thirty was chosen to be generous to a cold
// start and turned out to be the worst of both worlds: when the pool is
// saturated, every waiting request blocks for the FULL timeout before
// failing, so one slow period becomes a pile-up of requests each holding
// the server for half a minute. Observed directly — /healthz returned 503
// after 23.6s while a direct connection to the same database succeeded in
// 2.9s with 18 of 901 backends in use.
//
// Ten still covers a cold Neon wake (measured at 3-4s) with room to
// spare, and fails fast enough that a saturated pool degrades instead of
// cascading. On Vercel this matters more than locally: a 30s connection
// wait would consume most of a serverless function's budget before the
// query even starts.
const adapter = new PrismaPg({
  connectionString: getDatabaseUrl(),
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// Defaults (maxWait 2s, timeout 5s) are too tight for Neon's serverless
// connection latency, observed throughout this project to range from
// instant to several seconds. Widened for interactive transactions
// (e.g. atomic token numbering) to avoid spurious P2028 failures.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
