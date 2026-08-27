import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signSession, verifySession } from "./session";

// Separate cookie from staff_session and patient_session, so the three
// account kinds are genuinely distinct sessions rather than one cookie
// with a role claim: an admin session can never be mistaken for a clinic
// session by code that only knows how to read staff_session, and signing
// out of one does not silently sign you into another.
//
// Shortest TTL of the three (8h, vs 12h staff / 30d patient) — this is the
// account that can approve facilities and mark doctors verified across
// every tenant, so an unattended browser is the highest-value target.
const ADMIN_COOKIE = "admin_session";
const ADMIN_SESSION_TTL = "8h";
const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export interface AdminSession {
  adminId: string;
  name: string;
}

export async function createAdminSession(session: AdminSession): Promise<void> {
  const token = await signSession({ ...session }, ADMIN_SESSION_TTL);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySession<AdminSession & Record<string, unknown>>(token);
  if (!payload) return null;
  return { adminId: payload.adminId, name: payload.name };
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE);
}
