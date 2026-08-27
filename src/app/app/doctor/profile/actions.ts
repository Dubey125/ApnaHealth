"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireDoctorContext } from "@/lib/auth/staff";

export interface UpdateDoctorProfileState {
  error?: string;
}

const updateDoctorProfileSchema = z.object({
  qualificationText: z.string().trim().min(1),
  experienceYears: z.coerce.number().int().min(0).max(80).optional(),
  languagesText: z.string().trim().min(1).optional(),
  consultationFeeRupees: z.coerce.number().min(0).optional(),
  defaultConsultMinutes: z.coerce.number().int().min(1).max(120).optional(),
  bio: z.string().trim().min(1).optional(),
  photoUrl: z.string().trim().url().optional(),
  phone: z.string().trim().min(6).optional(),
  email: z.string().email().optional(),
});

// Doctor-only, scoped to session.doctorId — deliberately excludes name,
// specialty, registrationNumber/Council and verificationStatus: those are
// either identity (Owner-controlled via app/doctors) or feed the
// verification workflow (VerificationForm), and letting a doctor edit them
// unilaterally would desync the verification record from what was actually
// checked. This form only covers the doctor's own presentational/practice
// details.
export async function updateDoctorProfile(
  _prevState: UpdateDoctorProfileState,
  formData: FormData,
): Promise<UpdateDoctorProfileState> {
  const session = await requireDoctorContext();

  const parsed = updateDoctorProfileSchema.safeParse({
    qualificationText: formData.get("qualificationText"),
    experienceYears: formData.get("experienceYears") || undefined,
    languagesText: formData.get("languagesText") || undefined,
    consultationFeeRupees: formData.get("consultationFeeRupees") || undefined,
    defaultConsultMinutes: formData.get("defaultConsultMinutes") || undefined,
    bio: formData.get("bio") || undefined,
    photoUrl: formData.get("photoUrl") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
  });
  if (!parsed.success) {
    return { error: "Enter a qualification. Check that any numbers and the photo URL are valid." };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.doctor.update({
      where: { id: session.doctorId },
      data: {
        qualificationText: parsed.data.qualificationText,
        experienceYears: parsed.data.experienceYears ?? null,
        languagesText: parsed.data.languagesText ?? null,
        consultationFeeMinor:
          parsed.data.consultationFeeRupees != null ? Math.round(parsed.data.consultationFeeRupees * 100) : null,
        defaultConsultMinutes: parsed.data.defaultConsultMinutes ?? 6,
        bio: parsed.data.bio ?? null,
        photoUrl: parsed.data.photoUrl ?? null,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
      },
    }),
    prisma.auditEvent.create({
      data: {
        clinicId: session.clinicId,
        actorUserId: session.staffUserId,
        action: "DOCTOR_PROFILE_SELF_UPDATED",
        entityType: "Doctor",
        entityId: session.doctorId,
        occurredAt: now,
        metadata: { qualificationText: parsed.data.qualificationText },
      },
    }),
  ]);

  redirect("/app/doctor/profile?updated=1");
}
