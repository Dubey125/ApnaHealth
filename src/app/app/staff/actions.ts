"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/auth/staff";
import { hashPassword } from "@/lib/auth/password";

export interface StaffFormState {
  error?: string;
}

const createStaffSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["OWNER", "FRONT_DESK", "DOCTOR"]),
  doctorId: z.string().optional(),
});

// Owner-only (ACCESS_MATRIX.md has no "manage staff" row, but creating
// StaffUser rows is inherently an owner-level action — the same boundary
// already used for "Create session" and "Verify doctor"). Every StaffUser
// row before this phase only ever came from prisma/seed.ts.
export async function createStaffUser(_prevState: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const session = await requireStaffSession("OWNER");

  const parsed = createStaffSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    doctorId: formData.get("doctorId") || undefined,
  });
  if (!parsed.success) {
    return { error: "Enter a name, a valid email, an 8+ character password, and a role." };
  }

  if (parsed.data.role === "DOCTOR" && !parsed.data.doctorId) {
    return { error: "Select which doctor profile this account is for." };
  }

  const existingEmail = await prisma.staffUser.findUnique({ where: { email: parsed.data.email } });
  if (existingEmail) {
    return { error: "A staff account with this email already exists." };
  }

  let doctor = null;
  if (parsed.data.doctorId) {
    doctor = await prisma.doctor.findUnique({ where: { id: parsed.data.doctorId }, include: { staffAccount: true } });
    if (!doctor || doctor.clinicId !== session.clinicId) {
      return { error: "Doctor not found." };
    }
    if (doctor.staffAccount) {
      return { error: "This doctor already has a linked staff account." };
    }
  }

  const now = new Date();
  const staff = await prisma.$transaction(async (tx) => {
    const created = await tx.staffUser.create({
      data: {
        clinicId: session.clinicId,
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
        role: parsed.data.role,
        doctorId: parsed.data.role === "DOCTOR" ? parsed.data.doctorId : undefined,
      },
    });
    await tx.auditEvent.create({
      data: {
        clinicId: session.clinicId,
        actorUserId: session.staffUserId,
        action: "STAFF_USER_CREATED",
        entityType: "StaffUser",
        entityId: created.id,
        occurredAt: now,
        metadata: { name: created.name, email: created.email, role: created.role },
      },
    });
    return created;
  });

  redirect(`/app/staff?created=${staff.id}`);
}
