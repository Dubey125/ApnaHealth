import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rateLimit";

const STAFF_COOKIE = "staff_session";
const ADMIN_COOKIE = "admin_session";

// Deliberately not importing StaffRole/StaffSession from lib/auth/staff —
// this file stays decoupled from that module (see the comment on the
// coarse-gate check below) so only the one field actually needed here is
// typed locally.
interface StaffSessionPayload {
  role: "OWNER" | "FRONT_DESK" | "DOCTOR";
  doctorId?: string | null;
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
// Each entry decides, from the signed session payload alone, whether this
// exact path is permitted. The doctor routes accept an OWNER whose account
// is linked to a doctor profile (the independent practitioner from
// self-signup) as well as a DOCTOR — mirroring requireDoctorContext, which
// remains the real check at the page level.
const STATIC_ROLE_ROUTES: Record<string, (s: StaffSessionPayload) => boolean> = {
  "/app/analytics": (s) => s.role === "OWNER",
  "/app/doctor": (s) => s.role === "DOCTOR" || (s.role === "OWNER" && !!s.doctorId),
  "/app/doctor/schedule": (s) => s.role === "DOCTOR" || (s.role === "OWNER" && !!s.doctorId),
  "/app/doctor/profile": (s) => s.role === "DOCTOR" || (s.role === "OWNER" && !!s.doctorId),
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
  // Password reset. /forgot-password is limited harder than login because
  // each accepted request sends an email — an unlimited endpoint that mails
  // a third party on demand is a way to use ApnaHealth to spam someone.
  // /reset-password is limited because the token in the link is the only
  // thing standing between a guess and an account takeover.
  if (pathname === "/forgot-password") {
    return { limit: 5, windowMs: 15 * 60_000 };
  }
  if (pathname === "/reset-password") {
    return { limit: 10, windowMs: 15 * 60_000 };
  }
  if (pathname === "/patient/register") {
    return { limit: 5, windowMs: 15 * 60_000 };
  }
  // Public facility/doctor signup creates a Clinic plus a privileged
  // OWNER account, so it is rate limited at least as tightly as patient
  // registration.
  if (pathname === "/register/clinic" || pathname === "/register/doctor") {
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

  // The platform review console. Separate cookie from staff_session, so a
  // clinic session can never satisfy this gate no matter what role it
  // claims — /admin is not a higher tier of the clinic app, it is a
  // different application with a different tenancy story.
  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    const session = token ? await verifySession(token) : null;
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

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
    const isAllowed = STATIC_ROLE_ROUTES[pathname];
    if (isAllowed && !isAllowed(session)) {
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
  matcher: [
    "/app/:path*",
    "/admin/:path*",
    "/login",
    "/forgot-password",
    "/reset-password",
    "/patient/login",
    "/patient/register",
    "/register/:path*",
    "/book/:path*",
    "/t/:path*",
  ],
};
