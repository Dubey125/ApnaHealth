import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// pg's default pool size (10) isn't enough headroom for a burst of
// concurrent interactive transactions (e.g. several walk-ins issued at
// once) each holding a connection for the transaction's duration.
const adapter = new PrismaPg({ connectionString: getDatabaseUrl(), max: 20 });

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
