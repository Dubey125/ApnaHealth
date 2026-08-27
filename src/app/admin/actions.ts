"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminSession, clearAdminSession } from "@/lib/auth/admin";
import { verificationSchema, computeVerifiedAt } from "@/lib/verification";

export interface AdminActionState {
  error?: string;
}

export async function adminLogout(): Promise<void> {
  await clearAdminSession();
  redirect("/login");
}

const reviewSchema = z.object({
  clinicId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  // Required on a rejection: a facility told "no" with no reason cannot fix
  // anything, and the reviewer's reasoning is what makes the decision
  // auditable rather than arbitrary.
  notes: z.string().trim().min(1).optional(),
});

// The gate that self-serve signup created the need for. Anyone can create a
// Clinic from the public /register pages, so something outside that tenant
// has to decide whether it is real before patients can find it — and that
// decision cannot live with the facility's own owner.
export async function reviewFacility(_prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireAdminSession();

  const parsed = reviewSchema.safeParse({
    clinicId: formData.get("clinicId"),
    decision: formData.get("decision"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: "Choose approve or reject." };
  }
  if (parsed.data.decision === "REJECTED" && !parsed.data.notes) {
    return { error: "Give a reason when rejecting — the facility is shown it so they can correct and resubmit." };
  }

  const clinic = await prisma.clinic.findUnique({ where: { id: parsed.data.clinicId }, select: { id: true, name: true } });
  if (!clinic) {
    return { error: "That facility no longer exists." };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.clinic.update({
      where: { id: clinic.id },
      data: {
        approvalStatus: parsed.data.decision,
        approvalDecidedAt: now,
        approvalNotes: parsed.data.notes ?? null,
        reviewedByAdminId: admin.adminId,
      },
    }),
    prisma.adminEvent.create({
      data: {
        adminId: admin.adminId,
        action: parsed.data.decision === "APPROVED" ? "FACILITY_APPROVED" : "FACILITY_REJECTED",
        entityType: "Clinic",
        entityId: clinic.id,
        occurredAt: now,
        metadata: { name: clinic.name },
      },
    }),
    // Also written into the clinic's own audit trail, so a facility owner
    // reading /app/audit sees why their listing changed state rather than
    // finding it silently altered by someone they cannot see.
    prisma.auditEvent.create({
      data: {
        clinicId: clinic.id,
        actorUserId: null,
        action: parsed.data.decision === "APPROVED" ? "FACILITY_APPROVED" : "FACILITY_REJECTED",
        entityType: "Clinic",
        entityId: clinic.id,
        occurredAt: now,
        metadata: { by: "ApnaHealth review team", notes: parsed.data.notes ?? null },
      },
    }),
  ]);

  redirect(`/admin/facilities/${clinic.id}?reviewed=1`);
}

// Moved here from the clinic owner's screens. A doctor who signs up becomes
// the OWNER of their own practice, so leaving this with OWNER meant a
// doctor could mark their own medical registration verified — CLAUDE.md:
// verification "must never be fabricated or treated as automatic truth."
export async function recordDoctorVerification(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdminSession();

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

  const doctor = await prisma.doctor.findUnique({
    where: { id: parsed.data.doctorId },
    select: { id: true, clinicId: true, name: true },
  });
  if (!doctor) {
    return { error: "Doctor not found." };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.doctorVerification.create({
      data: {
        doctorId: doctor.id,
        checkedByAdminId: admin.adminId,
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
        verifiedByAdminId: admin.adminId,
        // Cleared, not left stale: this doctor's current verification is
        // now attributable to the platform, and leaving the old clinic
        // reviewer in place would misreport who stands behind it.
        verifiedByStaffUserId: null,
        verificationSource: parsed.data.sourceName,
        verificationNotes: parsed.data.notes ?? null,
      },
    }),
    prisma.adminEvent.create({
      data: {
        adminId: admin.adminId,
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
    prisma.auditEvent.create({
      data: {
        clinicId: doctor.clinicId,
        actorUserId: null,
        action: "DOCTOR_VERIFICATION_RECORDED",
        entityType: "Doctor",
        entityId: doctor.id,
        occurredAt: now,
        metadata: { status: parsed.data.status, by: "ApnaHealth review team" },
      },
    }),
  ]);

  redirect(`/admin/doctors/${doctor.id}?reviewed=1`);
}
