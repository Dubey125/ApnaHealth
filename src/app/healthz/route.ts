import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/log";

// Unauthenticated liveness/readiness probe for uptime monitors and the
// deployment platform. Deliberately returns nothing beyond ok/not-ok on
// failure — no stack trace, no connection string, no query details.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    logError(error, { path: "/healthz" });
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
