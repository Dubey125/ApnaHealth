"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { loadClinicBilling } from "@/lib/billing/load";
import { hasSeatAvailable } from "@/lib/billing/entitlements";
import { parsePhotoUrl } from "@/lib/images";
import { requireStaffSession } from "@/lib/auth/staff";
import { slugify } from "@/lib/slugify";

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
  phone: z.string().trim().min(6).optional(),
  email: z.string().email().optional(),
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
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    defaultConsultMinutes: formData.get("defaultConsultMinutes") || undefined,
  });
  if (!parsed.success) {
    return { error: "Enter a name, specialty and qualification, and check that any numbers are valid." };
  }

  // Validated apart from the rest of the form: see lib/images.ts.
  const photo = parsePhotoUrl(formData.get("photoUrl"));
  if (!photo.ok) {
    return { error: photo.error };
  }

  // Seat limit. Checked here, on the way in, and never applied
  // retroactively — a clinic that ends up over its allowance keeps every
  // doctor its patients are already booked with (see seatOverage).
  const billing = await loadClinicBilling(session.clinicId);
  if (!billing.entitlements.canScheduleNewWork) {
    return { error: "Your subscription is not active. Existing queues keep running; adding a doctor needs an active plan." };
  }
  if (billing.subscription) {
    const doctorCount = await prisma.doctor.count({ where: { clinicId: session.clinicId } });
    if (!hasSeatAvailable(doctorCount, billing.subscription.doctorSeats)) {
      return {
        error: `Your plan includes ${billing.subscription.doctorSeats} doctor seats and all are in use. Upgrade to add another doctor.`,
      };
    }
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
        photoUrl: photo.url,
        phone: parsed.data.phone,
        email: parsed.data.email,
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
