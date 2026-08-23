import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rateLimit";

const STAFF_COOKIE = "staff_session";

// Deliberately not importing StaffRole/StaffSession from lib/auth/staff —
// this file stays decoupled from that module (see the comment on the
// coarse-gate check below) so only the one field actually needed here is
// typed locally.
interface StaffSessionPayload {
  role: "OWNER" | "FRONT_DESK" | "DOCTOR";
}

// /app/analytics and /app/doctor each have a fixed, resource-independent
// role requirement (unlike /app/queue/[sessionId], which additionally
// needs a per-session DB check the page itself still performs — not
// duplicated here, since this file deliberately never touches
// Prisma/pg). Enforced here, before any rendering begins, because a page
// under loading.tsx's automatic Suspense boundary can't turn its own
// redirect() into a real HTTP redirect once streaming has started —
// confirmed by testing: it silently falls back to a client-side
// <meta refresh>, which doesn't leak the protected content but leaves a
// non-browser client sitting on a 200 response. The page-level
// requireStaffSession(role) check stays in place either way; this is
// defense in depth; not a replacement.
const STATIC_ROLE_ROUTES: Record<string, StaffSessionPayload["role"]> = {
  "/app/analytics": "OWNER",
  "/app/doctor": "DOCTOR",
  "/app/doctor/schedule": "DOCTOR",
  "/app/doctor/profile": "DOCTOR",
};

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
    const session = token ? await verifySession<StaffSessionPayload & Record<string, unknown>>(token) : null;
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const requiredRole = STATIC_ROLE_ROUTES[pathname];
    if (requiredRole && session.role !== requiredRole) {
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
