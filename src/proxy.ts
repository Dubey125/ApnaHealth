import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rateLimit";

const STAFF_COOKIE = "staff_session";

interface RateLimitRule {
  limit: number;
  windowMs: number;
}

// Public, unauthenticated, mutating routes only. GET /t/[publicId]
// polling is deliberately excluded (QUEUE_RULES.md: "Polling is
// acceptable"), as is /healthz (needed by uptime monitors) and everything
// under /app (already behind the staff-session gate below).
function matchRateLimitRule(pathname: string): RateLimitRule | null {
  if (pathname === "/login" || pathname === "/patient/login") {
    return { limit: 10, windowMs: 5 * 60_000 };
  }
  if (pathname === "/patient/register") {
    return { limit: 5, windowMs: 15 * 60_000 };
  }
  if (pathname.startsWith("/book/")) {
    return { limit: 10, windowMs: 5 * 60_000 };
  }
  if (pathname.startsWith("/t/")) {
    return { limit: 20, windowMs: 5 * 60_000 };
  }
  return null;
}

// x-forwarded-for is set by Vercel's edge network; falls back to
// x-real-ip, then a shared bucket if neither is present (e.g. local dev).
function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Coarse gate only: confirms a valid, unexpired, untampered staff
  // session cookie exists. Role-specific checks happen server-side in
  // requireStaffSession() at the page/action level — proxy always runs on
  // the Node.js runtime in Next 16, but there's no need to touch
  // Prisma/pg here at all.
  if (pathname.startsWith("/app")) {
    const token = request.cookies.get(STAFF_COOKIE)?.value;
    const session = token ? await verifySession(token) : null;
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  if (request.method === "POST") {
    const rule = matchRateLimitRule(pathname);
    if (rule) {
      const result = checkRateLimit(`${pathname}:${clientKey(request)}`, rule.limit, rule.windowMs);
      if (!result.allowed) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/login", "/patient/login", "/patient/register", "/book/:path*", "/t/:path*"],
};
