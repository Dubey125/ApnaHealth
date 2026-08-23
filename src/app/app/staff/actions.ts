"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaffSession, assertClinicAccess } from "@/lib/auth/staff";
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

const updateStaffSchema = z.object({
  staffUserId: z.string().min(1),
  name: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: z.enum(["OWNER", "FRONT_DESK", "DOCTOR"]),
  doctorId: z.string().optional(),
});

export async function updateStaffUser(_prevState: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const session = await requireStaffSession("OWNER");

  const parsed = updateStaffSchema.safeParse({
    staffUserId: formData.get("staffUserId"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password") || undefined,
    role: formData.get("role"),
    doctorId: formData.get("doctorId") || undefined,
  });
  if (!parsed.success) {
    return { error: "Enter a name, a valid email, a role, and (if changed) an 8+ character password." };
  }

  if (parsed.data.role === "DOCTOR" && !parsed.data.doctorId) {
    return { error: "Select which doctor profile this account is for." };
  }

  const staffUser = await prisma.staffUser.findUnique({ where: { id: parsed.data.staffUserId } });
  if (!staffUser) {
    return { error: "Staff account not found." };
  }
  assertClinicAccess(session, staffUser.clinicId);

  const existingEmail = await prisma.staffUser.findUnique({ where: { email: parsed.data.email } });
  if (existingEmail && existingEmail.id !== staffUser.id) {
    return { error: "A staff account with this email already exists." };
  }

  let doctorId: string | null = null;
  if (parsed.data.role === "DOCTOR" && parsed.data.doctorId) {
    const doctor = await prisma.doctor.findUnique({ where: { id: parsed.data.doctorId }, include: { staffAccount: true } });
    if (!doctor || doctor.clinicId !== session.clinicId) {
      return { error: "Doctor not found." };
    }
    if (doctor.staffAccount && doctor.staffAccount.id !== staffUser.id) {
      return { error: "This doctor already has a linked staff account." };
    }
    doctorId = doctor.id;
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.staffUser.update({
      where: { id: staffUser.id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        doctorId,
        ...(parsed.data.password ? { passwordHash: await hashPassword(parsed.data.password) } : {}),
      },
    }),
    prisma.auditEvent.create({
      data: {
        clinicId: session.clinicId,
        actorUserId: session.staffUserId,
        action: "STAFF_USER_UPDATED",
        entityType: "StaffUser",
        entityId: staffUser.id,
        occurredAt: now,
        metadata: { name: parsed.data.name, email: parsed.data.email, role: parsed.data.role, passwordChanged: !!parsed.data.password },
      },
    }),
  ]);

  redirect(`/app/staff/${staffUser.id}?updated=1`);
}

const toggleActiveSchema = z.object({
  staffUserId: z.string().min(1),
  makeActive: z.enum(["true", "false"]),
});

// Deactivate rather than delete: a StaffUser is referenced by QueueEvent,
// DoctorVerification etc. history that must stay attributable, and
// deactivation is reversible while a delete wouldn't be (the schema has no
// cascade/restrict story for "someone deletes the person who verified a
// doctor two months ago").
export async function toggleStaffActive(_prevState: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const session = await requireStaffSession("OWNER");

  const parsed = toggleActiveSchema.safeParse({
    staffUserId: formData.get("staffUserId"),
    makeActive: formData.get("makeActive"),
  });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  if (parsed.data.staffUserId === session.staffUserId) {
    return { error: "You cannot deactivate your own account." };
  }

  const staffUser = await prisma.staffUser.findUnique({ where: { id: parsed.data.staffUserId } });
  if (!staffUser) {
    return { error: "Staff account not found." };
  }
  assertClinicAccess(session, staffUser.clinicId);

  const makeActive = parsed.data.makeActive === "true";
  const now = new Date();
  await prisma.$transaction([
    prisma.staffUser.update({ where: { id: staffUser.id }, data: { isActive: makeActive } }),
    prisma.auditEvent.create({
      data: {
        clinicId: session.clinicId,
        actorUserId: session.staffUserId,
        action: makeActive ? "STAFF_USER_ACTIVATED" : "STAFF_USER_DEACTIVATED",
        entityType: "StaffUser",
        entityId: staffUser.id,
        occurredAt: now,
        metadata: { name: staffUser.name, email: staffUser.email },
      },
    }),
  ]);

  redirect(`/app/staff/${staffUser.id}?updated=1`);
}
