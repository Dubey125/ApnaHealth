"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/auth/staff";

export interface UpdateClinicState {
  error?: string;
}

const updateClinicSchema = z.object({
  name: z.string().trim().min(1),
  addressLine: z.string().trim().min(1),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  postalCode: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1),
});

// Owner-only, same boundary as every other /app/clinic-scoped write action.
// Timezone is deliberately not editable here: lib/format.ts hardcodes
// Asia/Kolkata rather than reading Clinic.timezone (see its own comment),
// so exposing a timezone control would imply an effect it doesn't have.
export async function updateClinic(_prevState: UpdateClinicState, formData: FormData): Promise<UpdateClinicState> {
  const session = await requireStaffSession("OWNER");

  const parsed = updateClinicSchema.safeParse({
    name: formData.get("name"),
    addressLine: formData.get("addressLine"),
    city: formData.get("city"),
    state: formData.get("state"),
    postalCode: formData.get("postalCode") || undefined,
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { error: "Enter a clinic name, address, city, state and phone number." };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.clinic.update({
      where: { id: session.clinicId },
      data: {
        name: parsed.data.name,
        addressLine: parsed.data.addressLine,
        city: parsed.data.city,
        state: parsed.data.state,
        postalCode: parsed.data.postalCode ?? null,
        phone: parsed.data.phone,
      },
    }),
    prisma.auditEvent.create({
      data: {
        clinicId: session.clinicId,
        actorUserId: session.staffUserId,
        action: "CLINIC_PROFILE_UPDATED",
        entityType: "Clinic",
        entityId: session.clinicId,
        occurredAt: now,
        metadata: { name: parsed.data.name, city: parsed.data.city },
      },
    }),
  ]);

  redirect("/app/clinic?updated=1");
}
