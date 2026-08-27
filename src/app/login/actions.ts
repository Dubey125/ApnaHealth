"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createStaffSession, clearStaffSession } from "@/lib/auth/staff";
import { createPatientSession } from "@/lib/auth/patient";
import { createAdminSession } from "@/lib/auth/admin";
import { looksLikeEmail, phoneCandidates } from "@/lib/auth/identifier";

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

export interface StaffLoginState {
  error?: string;
}

// One error string for every failure mode — unknown account, wrong
// password, deactivated account. Distinguishing them would turn this box
// into an oracle for "does this person have an ApnaHealth account", which
// for a health platform leaks more than a login usually does.
const GENERIC_FAILURE = "Those login details didn't match an ApnaHealth account.";

type Resolved =
  | { kind: "admin"; id: string; name: string; passwordHash: string }
  | { kind: "staff"; id: string; clinicId: string; role: "OWNER" | "FRONT_DESK" | "DOCTOR"; doctorId: string | null; passwordHash: string }
  | { kind: "patient"; id: string; passwordHash: string };

// One login box for every role, which is what visitors expect and what the
// header now offers. The three account tables are queried in descending
// order of privilege, but the FIRST ONE WHOSE PASSWORD MATCHES wins rather
// than the first one found: the tables have independent unique constraints,
// so one address can legitimately exist in two of them (a clinic owner who
// is also a patient), and picking by table order alone would lock such a
// person out of their second account forever.
async function resolveCandidates(identifier: string): Promise<Resolved[]> {
  if (looksLikeEmail(identifier)) {
    // Signup stores the address as typed, so an account created as
    // "Owner@Clinic.in" would never be found by a lowercased lookup. Both
    // spellings are offered; the unique index still makes each an index
    // hit, and findFirst is used because findUnique cannot take an `in`.
    const emails = [...new Set([identifier, identifier.toLowerCase()])];
    const [admin, staff, patient] = await Promise.all([
      prisma.platformAdmin.findFirst({
        where: { email: { in: emails } },
        select: { id: true, name: true, passwordHash: true, isActive: true },
      }),
      prisma.staffUser.findFirst({
        where: { email: { in: emails } },
        select: { id: true, clinicId: true, role: true, doctorId: true, passwordHash: true, isActive: true },
      }),
      prisma.patient.findFirst({ where: { email: { in: emails } }, select: { id: true, passwordHash: true } }),
    ]);
    const candidates: Resolved[] = [];
    if (admin?.isActive) candidates.push({ kind: "admin", id: admin.id, name: admin.name, passwordHash: admin.passwordHash });
    if (staff?.isActive)
      candidates.push({
        kind: "staff",
        id: staff.id,
        clinicId: staff.clinicId,
        role: staff.role,
        doctorId: staff.doctorId,
        passwordHash: staff.passwordHash,
      });
    if (patient) candidates.push({ kind: "patient", id: patient.id, passwordHash: patient.passwordHash });
    return candidates;
  }

  // Not an email, so it can only be a patient: staff and admin accounts
  // have no phone identity to log in with.
  const candidates = phoneCandidates(identifier);
  if (candidates.length === 0) return [];
  const patient = await prisma.patient.findFirst({
    where: { phone: { in: candidates } },
    select: { id: true, passwordHash: true },
  });
  return patient ? [{ kind: "patient", id: patient.id, passwordHash: patient.passwordHash }] : [];
}

export async function staffLogin(_prevState: StaffLoginState, formData: FormData): Promise<StaffLoginState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter your email or phone number, and your password." };
  }

  const candidates = await resolveCandidates(parsed.data.identifier);

  let matched: Resolved | null = null;
  for (const candidate of candidates) {
    if (await verifyPassword(parsed.data.password, candidate.passwordHash)) {
      matched = candidate;
      break;
    }
  }
  if (!matched) {
    return { error: GENERIC_FAILURE };
  }

  // Redirect targets are fixed per account kind rather than taken from a
  // ?next= parameter: this form is linked from everywhere, and an
  // attacker-supplied destination on a login page is an open redirect.
  if (matched.kind === "admin") {
    await prisma.platformAdmin.update({ where: { id: matched.id }, data: { lastLoginAt: new Date() } });
    await createAdminSession({ adminId: matched.id, name: matched.name });
    redirect("/admin");
  }

  if (matched.kind === "staff") {
    await createStaffSession({
      staffUserId: matched.id,
      clinicId: matched.clinicId,
      role: matched.role,
      doctorId: matched.doctorId,
    });
    redirect("/app");
  }

  await createPatientSession({ patientId: matched.id });
  redirect("/patient/account");
}

export async function staffLogout(): Promise<void> {
  await clearStaffSession();
  redirect("/login");
}
