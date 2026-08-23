"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaffSession, assertClinicAccess } from "@/lib/auth/staff";
import { verificationSchema, computeVerifiedAt } from "@/lib/verification";
import { slugify } from "@/lib/slugify";

export interface VerifyDoctorState {
  error?: string;
}

export interface CreateDoctorState {
  error?: string;
}

const createDoctorSchema = z.object({
  name: z.string().trim().min(1),
  specialty: z.string().trim().min(1),
  qualificationText: z.string().trim().min(1),
  registrationNumber: z.string().trim().min(1).optional(),
  registrationCouncil: z.string().trim().min(1).optional(),
  experienceYears: z.coerce.number().int().min(0).max(80).optional(),
  languagesText: z.string().trim().min(1).optional(),
  consultationFeeRupees: z.coerce.number().min(0).optional(),
  bio: z.string().trim().min(1).optional(),
  photoUrl: z.string().trim().url().optional(),
  defaultConsultMinutes: z.coerce.number().int().min(1).max(120).optional(),
});

// Owner-only, same boundary as "Create session"/"Verify doctor"
// (ACCESS_MATRIX.md has no explicit "create doctor" row, but every Doctor
// row before this action only ever came from prisma/seed.ts — there was no
// way to onboard a new doctor without direct DB access). Deliberately does
// NOT set verificationStatus: it keeps the schema default (PENDING) so a
// newly created doctor still has to go through the real verification
// workflow — CLAUDE.md: "Doctor verification must never be fabricated or
// treated as automatic truth."
export async function createDoctor(_prevState: CreateDoctorState, formData: FormData): Promise<CreateDoctorState> {
  const session = await requireStaffSession("OWNER");

  const parsed = createDoctorSchema.safeParse({
    name: formData.get("name"),
    specialty: formData.get("specialty"),
    qualificationText: formData.get("qualificationText"),
    registrationNumber: formData.get("registrationNumber") || undefined,
    registrationCouncil: formData.get("registrationCouncil") || undefined,
    experienceYears: formData.get("experienceYears") || undefined,
    languagesText: formData.get("languagesText") || undefined,
    consultationFeeRupees: formData.get("consultationFeeRupees") || undefined,
    bio: formData.get("bio") || undefined,
    photoUrl: formData.get("photoUrl") || undefined,
    defaultConsultMinutes: formData.get("defaultConsultMinutes") || undefined,
  });
  if (!parsed.success) {
    return { error: "Enter a name, specialty and qualification. Check that any numbers and the photo URL are valid." };
  }

  // Doctor.slug is globally unique (it's the public /doctors/[slug] path),
  // so two same-named doctors across different clinics need distinct
  // slugs — appended numeric suffix, same idea as a filename collision.
  const baseSlug = slugify(parsed.data.name) || "doctor";
  let slug = baseSlug;
  let suffix = 2;
  while (await prisma.doctor.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const now = new Date();
  const doctor = await prisma.$transaction(async (tx) => {
    const created = await tx.doctor.create({
      data: {
        clinicId: session.clinicId,
        name: parsed.data.name,
        slug,
        specialty: parsed.data.specialty,
        qualificationText: parsed.data.qualificationText,
        registrationNumber: parsed.data.registrationNumber,
        registrationCouncil: parsed.data.registrationCouncil,
        experienceYears: parsed.data.experienceYears,
        languagesText: parsed.data.languagesText,
        consultationFeeMinor:
          parsed.data.consultationFeeRupees != null ? Math.round(parsed.data.consultationFeeRupees * 100) : undefined,
        bio: parsed.data.bio,
        photoUrl: parsed.data.photoUrl,
        defaultConsultMinutes: parsed.data.defaultConsultMinutes,
      },
    });
    await tx.auditEvent.create({
      data: {
        clinicId: session.clinicId,
        actorUserId: session.staffUserId,
        action: "DOCTOR_CREATED",
        entityType: "Doctor",
        entityId: created.id,
        occurredAt: now,
        metadata: { name: created.name, specialty: created.specialty },
      },
    });
    return created;
  });

  redirect(`/app/doctors?created=${doctor.id}`);
}

export async function recordDoctorVerification(
  _prevState: VerifyDoctorState,
  formData: FormData,
): Promise<VerifyDoctorState> {
  const session = await requireStaffSession("OWNER");

  const parsed = verificationSchema.safeParse({
    doctorId: formData.get("doctorId"),
    status: formData.get("status"),
    registrationNumberChecked: formData.get("registrationNumberChecked"),
    sourceName: formData.get("sourceName"),
    sourceReference: formData.get("sourceReference") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: "Provide the registration number you checked, the source you checked it against, and a status." };
  }

  const doctor = await prisma.doctor.findUnique({ where: { id: parsed.data.doctorId } });
  if (!doctor) {
    return { error: "Doctor not found." };
  }
  assertClinicAccess(session, doctor.clinicId);

  const now = new Date();
  await prisma.$transaction([
    prisma.doctorVerification.create({
      data: {
        doctorId: doctor.id,
        checkedByStaffUserId: session.staffUserId,
        status: parsed.data.status,
        registrationNumberChecked: parsed.data.registrationNumberChecked,
        sourceName: parsed.data.sourceName,
        sourceReference: parsed.data.sourceReference,
        checkedAt: now,
        notes: parsed.data.notes,
      },
    }),
    prisma.doctor.update({
      where: { id: doctor.id },
      data: {
        verificationStatus: parsed.data.status,
        verifiedAt: computeVerifiedAt(parsed.data.status, now),
        verifiedByStaffUserId: session.staffUserId,
        verificationSource: parsed.data.sourceName,
        verificationNotes: parsed.data.notes ?? null,
      },
    }),
    prisma.auditEvent.create({
      data: {
        clinicId: doctor.clinicId,
        actorUserId: session.staffUserId,
        action: "DOCTOR_VERIFICATION_RECORDED",
        entityType: "Doctor",
        entityId: doctor.id,
        occurredAt: now,
        metadata: {
          status: parsed.data.status,
          registrationNumberChecked: parsed.data.registrationNumberChecked,
          sourceName: parsed.data.sourceName,
        },
      },
    }),
  ]);

  redirect(`/app/doctors/${doctor.id}`);
}
