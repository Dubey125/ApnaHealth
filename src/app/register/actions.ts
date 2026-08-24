"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createStaffSession } from "@/lib/auth/staff";
import { slugify } from "@/lib/slugify";

export interface RegisterState {
  error?: string;
}

const facilitySchema = z.object({
  facilityName: z.string().trim().min(1),
  facilityType: z.enum(["CLINIC", "HOSPITAL"]),
  addressLine: z.string().trim().min(1),
  areaLabel: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  postalCode: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(6),
  contactName: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

// A globally-unique slug for /doctors/[slug]. Extracted here because both
// self-signup and the owner's "add doctor" form need the same collision
// handling — Doctor.slug is unique across every clinic, so two same-named
// doctors at different facilities must still resolve to distinct URLs.
async function uniqueDoctorSlug(name: string): Promise<string> {
  const base = slugify(name) || "doctor";
  let slug = base;
  let suffix = 2;
  while (await prisma.doctor.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

// Self-serve onboarding for a clinic or hospital: creates the facility and
// its first OWNER account together, since a facility with no one able to
// administer it is not a usable state. The owner then adds doctors and
// staff through the existing /app screens.
export async function registerFacility(_prevState: RegisterState, formData: FormData): Promise<RegisterState> {
  const parsed = facilitySchema.safeParse({
    facilityName: formData.get("facilityName"),
    facilityType: formData.get("facilityType"),
    addressLine: formData.get("addressLine"),
    areaLabel: formData.get("areaLabel") || undefined,
    city: formData.get("city"),
    state: formData.get("state"),
    postalCode: formData.get("postalCode") || undefined,
    phone: formData.get("phone"),
    contactName: formData.get("contactName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Check the form: facility name, address, city, state, phone, your name, a valid email and an 8+ character password are all required." };
  }

  // StaffUser.email is globally unique, so this is checked before the
  // transaction to return a friendly message rather than a constraint error.
  const existing = await prisma.staffUser.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return { error: "An account with this email already exists. Sign in instead." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const created = await prisma.$transaction(async (tx) => {
    const clinic = await tx.clinic.create({
      data: {
        name: parsed.data.facilityName,
        facilityType: parsed.data.facilityType,
        addressLine: parsed.data.addressLine,
        areaLabel: parsed.data.areaLabel ?? null,
        city: parsed.data.city,
        state: parsed.data.state,
        postalCode: parsed.data.postalCode ?? null,
        phone: parsed.data.phone,
      },
    });
    const staff = await tx.staffUser.create({
      data: {
        clinicId: clinic.id,
        name: parsed.data.contactName,
        email: parsed.data.email,
        passwordHash,
        role: "OWNER",
      },
    });
    await tx.auditEvent.create({
      data: {
        clinicId: clinic.id,
        actorUserId: staff.id,
        action: "FACILITY_REGISTERED",
        entityType: "Clinic",
        entityId: clinic.id,
        occurredAt: new Date(),
        metadata: { facilityType: parsed.data.facilityType, city: parsed.data.city },
      },
    });
    return { clinic, staff };
  });

  await createStaffSession({
    staffUserId: created.staff.id,
    clinicId: created.clinic.id,
    role: "OWNER",
    doctorId: null,
  });
  redirect("/app");
}

const doctorSchema = z.object({
  doctorName: z.string().trim().min(1),
  specialty: z.string().trim().min(1),
  qualificationText: z.string().trim().min(1),
  registrationNumber: z.string().trim().min(1).optional(),
  registrationCouncil: z.string().trim().min(1).optional(),
  doctorPhone: z.string().trim().min(6).optional(),
  practiceName: z.string().trim().min(1),
  addressLine: z.string().trim().min(1),
  areaLabel: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  phone: z.string().trim().min(6),
  email: z.string().email(),
  password: z.string().min(8),
});

// Self-serve onboarding for an independent doctor. Creates the doctor's
// own practice (a Clinic row) alongside their Doctor profile, because
// Doctor.clinicId is a required relation — an independent practitioner in
// India *is* their own practice, so this is an accurate model rather than
// a placeholder.
//
// The account is created with role OWNER and doctorId linked: they need
// owner-level control of their own practice (sessions, staff, analytics)
// AND a doctor profile. Doctor-only screens accept an OWNER whose
// doctorId is set — see requireDoctorContext.
//
// verificationStatus is deliberately left at its PENDING default and no
// DoctorVerification row is written: CLAUDE.md is explicit that
// verification must never be fabricated or treated as automatic truth. A
// self-registered doctor is unverified until a real check is recorded.
export async function registerDoctor(_prevState: RegisterState, formData: FormData): Promise<RegisterState> {
  const parsed = doctorSchema.safeParse({
    doctorName: formData.get("doctorName"),
    specialty: formData.get("specialty"),
    qualificationText: formData.get("qualificationText"),
    registrationNumber: formData.get("registrationNumber") || undefined,
    registrationCouncil: formData.get("registrationCouncil") || undefined,
    doctorPhone: formData.get("doctorPhone") || undefined,
    practiceName: formData.get("practiceName"),
    addressLine: formData.get("addressLine"),
    areaLabel: formData.get("areaLabel") || undefined,
    city: formData.get("city"),
    state: formData.get("state"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Check the form: your name, specialty, qualification, practice name, address, city, state, phone, a valid email and an 8+ character password are all required." };
  }

  const existing = await prisma.staffUser.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return { error: "An account with this email already exists. Sign in instead." };
  }

  const slug = await uniqueDoctorSlug(parsed.data.doctorName);
  const passwordHash = await hashPassword(parsed.data.password);

  const created = await prisma.$transaction(async (tx) => {
    const clinic = await tx.clinic.create({
      data: {
        name: parsed.data.practiceName,
        facilityType: "CLINIC",
        addressLine: parsed.data.addressLine,
        areaLabel: parsed.data.areaLabel ?? null,
        city: parsed.data.city,
        state: parsed.data.state,
        phone: parsed.data.phone,
      },
    });
    const doctor = await tx.doctor.create({
      data: {
        clinicId: clinic.id,
        name: parsed.data.doctorName,
        slug,
        specialty: parsed.data.specialty,
        qualificationText: parsed.data.qualificationText,
        registrationNumber: parsed.data.registrationNumber,
        registrationCouncil: parsed.data.registrationCouncil,
        phone: parsed.data.doctorPhone,
        email: parsed.data.email,
      },
    });
    const staff = await tx.staffUser.create({
      data: {
        clinicId: clinic.id,
        name: parsed.data.doctorName,
        email: parsed.data.email,
        passwordHash,
        role: "OWNER",
        doctorId: doctor.id,
      },
    });
    await tx.auditEvent.create({
      data: {
        clinicId: clinic.id,
        actorUserId: staff.id,
        action: "DOCTOR_SELF_REGISTERED",
        entityType: "Doctor",
        entityId: doctor.id,
        occurredAt: new Date(),
        metadata: { specialty: parsed.data.specialty, city: parsed.data.city },
      },
    });
    return { clinic, staff, doctor };
  });

  await createStaffSession({
    staffUserId: created.staff.id,
    clinicId: created.clinic.id,
    role: "OWNER",
    doctorId: created.doctor.id,
  });
  redirect("/app/doctor");
}
