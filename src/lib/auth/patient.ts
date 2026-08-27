import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signSession, verifySession } from "./session";

const PATIENT_COOKIE = "patient_session";
const PATIENT_SESSION_TTL = "30d";
const PATIENT_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface PatientSession {
  patientId: string;
}

export async function createPatientSession(session: PatientSession): Promise<void> {
  const token = await signSession({ ...session }, PATIENT_SESSION_TTL);
  const cookieStore = await cookies();
  cookieStore.set(PATIENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PATIENT_SESSION_MAX_AGE_SECONDS,
  });
}

export async function getPatientSession(): Promise<PatientSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PATIENT_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySession<PatientSession & Record<string, unknown>>(token);
  if (!payload) return null;
  return { patientId: payload.patientId };
}

export async function requirePatientSession(): Promise<PatientSession> {
  const session = await getPatientSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function clearPatientSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(PATIENT_COOKIE);
}
