import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signSession, verifySession } from "./session";
import { StaffRole } from "@/generated/prisma/enums";

const STAFF_COOKIE = "staff_session";
const STAFF_SESSION_TTL = "12h";
const STAFF_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export interface StaffSession {
  staffUserId: string;
  clinicId: string;
  role: StaffRole;
  doctorId: string | null;
}

export async function createStaffSession(session: StaffSession): Promise<void> {
  const token = await signSession({ ...session }, STAFF_SESSION_TTL);
  const cookieStore = await cookies();
  cookieStore.set(STAFF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
  });
}

export async function getStaffSession(): Promise<StaffSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySession<StaffSession & Record<string, unknown>>(token);
  if (!payload) return null;
  return {
    staffUserId: payload.staffUserId,
    clinicId: payload.clinicId,
    role: payload.role,
    doctorId: payload.doctorId ?? null,
  };
}

// Pure and independently testable: true when `roles` is empty (any staff
// role is fine) or the session's role is one of `roles`.
export function hasRequiredRole(session: Pick<StaffSession, "role">, roles: StaffRole[]): boolean {
  return roles.length === 0 || roles.includes(session.role);
}

// Redirects to /login when there's no session or the session's role isn't
// one of `roles` (when given). Kept deliberately simple: a wrong-role
// authenticated user and an anonymous visitor both land on /login, rather
// than exercising Next's still-experimental forbidden()/unauthorized().
export async function requireStaffSession(...roles: StaffRole[]): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) {
    redirect("/login");
  }
  if (!hasRequiredRole(session, roles)) {
    redirect("/login");
  }
  return session;
}

export async function clearStaffSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(STAFF_COOKIE);
}

// Clinic isolation primitive: every staff-scoped query/mutation must be
// checked against the resource's clinicId before it runs.
export function assertClinicAccess(session: Pick<StaffSession, "clinicId">, resourceClinicId: string): void {
  if (session.clinicId !== resourceClinicId) {
    throw new Error("Cross-clinic access denied");
  }
}
