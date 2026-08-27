"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createPatientSession, clearPatientSession, requirePatientSession } from "@/lib/auth/patient";

export interface PatientAuthState {
  error?: string;
}

const registerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(6),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  password: z.string().min(8),
});

export async function patientRegister(_prevState: PatientAuthState, formData: FormData): Promise<PatientAuthState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Check the form: name, phone (6+ digits) and an 8+ character password are required." };
  }

  const existing = await prisma.patient.findUnique({ where: { phone: parsed.data.phone } });
  if (existing) {
    return { error: "An account with this phone number already exists." };
  }

  const patient = await prisma.patient.create({
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email ? parsed.data.email : null,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });

  await createPatientSession({ patientId: patient.id });
  redirect("/patient/account");
}

const loginSchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
});

export async function patientLogin(_prevState: PatientAuthState, formData: FormData): Promise<PatientAuthState> {
  const parsed = loginSchema.safeParse({
    phone: formData.get("phone"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter your phone number and password." };
  }

  const patient = await prisma.patient.findUnique({ where: { phone: parsed.data.phone } });
  if (!patient) {
    return { error: "Invalid phone number or password." };
  }

  const passwordOk = await verifyPassword(parsed.data.password, patient.passwordHash);
  if (!passwordOk) {
    return { error: "Invalid phone number or password." };
  }

  await createPatientSession({ patientId: patient.id });
  redirect("/patient/account");
}

export async function patientLogout(): Promise<void> {
  await clearPatientSession();
  redirect("/login");
}

export interface UpdateContactState {
  error?: string;
  saved?: boolean;
}

const updateContactSchema = z.object({
  name: z.string().trim().min(1),
  email: z.union([z.string().trim().email(), z.literal("")]),
});

// Patient signup asks for a phone number, not an email — which is right for
// India, but it left phone-only accounts with no way to ever recover a
// forgotten password, since the reset link has to be emailed somewhere.
// This is that missing half: an account with no email can add one, and the
// /forgot-password page points here instead of promising a front-desk reset
// that does not exist.
export async function updatePatientContact(
  _prevState: UpdateContactState,
  formData: FormData,
): Promise<UpdateContactState> {
  const session = await requirePatientSession();

  const parsed = updateContactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: "Enter your name, and either a valid email address or none at all." };
  }

  const email = parsed.data.email === "" ? null : parsed.data.email;
  if (email) {
    // Patient.email is unique, and it is also a login identifier — so a
    // clash is checked here rather than surfaced as a constraint error.
    const clash = await prisma.patient.findFirst({
      where: { email, id: { not: session.patientId } },
      select: { id: true },
    });
    if (clash) {
      return { error: "Another account already uses that email address." };
    }
  }

  await prisma.patient.update({
    where: { id: session.patientId },
    data: { name: parsed.data.name, email },
  });

  return { saved: true };
}
