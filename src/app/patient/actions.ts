"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createPatientSession, clearPatientSession } from "@/lib/auth/patient";

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
  redirect("/patient/login");
}
