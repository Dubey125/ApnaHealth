"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/auth/staff";
import { parseCoordinatePairFields } from "@/lib/geo/formCoordinates";

export interface UpdateClinicState {
  error?: string;
}

const updateClinicSchema = z.object({
  name: z.string().trim().min(1),
  facilityType: z.enum(["CLINIC", "HOSPITAL"]),
  addressLine: z.string().trim().min(1),
  areaLabel: z.string().trim().min(1).optional(),
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
    facilityType: formData.get("facilityType"),
    addressLine: formData.get("addressLine"),
    areaLabel: formData.get("areaLabel") || undefined,
    city: formData.get("city"),
    state: formData.get("state"),
    postalCode: formData.get("postalCode") || undefined,
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { error: "Enter a facility name and type, address, city, state and phone number." };
  }

  // Map location is validated separately from the rest of the form: it is
  // optional, it is a pair, and its own error message is more useful than
  // the catch-all above.
  const coordinates = parseCoordinatePairFields(formData.get("latitude"), formData.get("longitude"));
  if (!coordinates.ok) {
    return { error: coordinates.error };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.clinic.update({
      where: { id: session.clinicId },
      data: {
        name: parsed.data.name,
        facilityType: parsed.data.facilityType,
        addressLine: parsed.data.addressLine,
        areaLabel: parsed.data.areaLabel ?? null,
        city: parsed.data.city,
        state: parsed.data.state,
        postalCode: parsed.data.postalCode ?? null,
        latitude: coordinates.coordinates?.latitude ?? null,
        longitude: coordinates.coordinates?.longitude ?? null,
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
        // The facility's own coordinates are a published property of a
        // business, not personal data — recording whether they changed
        // keeps the discovery listing auditable.
        metadata: {
          name: parsed.data.name,
          city: parsed.data.city,
          hasCoordinates: coordinates.coordinates !== null,
        },
      },
    }),
  ]);

  redirect("/app/clinic?updated=1");
}
