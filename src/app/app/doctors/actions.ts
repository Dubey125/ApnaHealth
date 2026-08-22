"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaffSession, assertClinicAccess } from "@/lib/auth/staff";
import { verificationSchema, computeVerifiedAt } from "@/lib/verification";

export interface VerifyDoctorState {
  error?: string;
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
