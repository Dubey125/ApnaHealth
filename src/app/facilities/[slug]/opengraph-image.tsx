import { prisma } from "@/lib/db";
import { LISTED_CLINIC } from "@/lib/publicListing";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/ogImage";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Clinic or hospital on ApnaHealth";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  // Awaited, not read directly: params is a Promise in Next 16, and
  // `params.slug` on the Promise is undefined — which Prisma treats as "no
  // constraint", so this route happily returned a different doctor's card
  // for every URL until this was fixed.
  const { slug } = await params;
  const clinic = await prisma.clinic.findFirst({
    where: { slug, ...LISTED_CLINIC },
    include: {
      doctors: { where: { isActive: true }, select: { specialty: true, verificationStatus: true } },
    },
  });

  if (!clinic) {
    return renderOgCard({ kind: "ApnaHealth", title: "Find clinics and hospitals near you" });
  }

  const specialties = [...new Set(clinic.doctors.map((doctor) => doctor.specialty))];
  const verified = clinic.doctors.filter((doctor) => doctor.verificationStatus === "VERIFIED").length;
  const isHospital = clinic.facilityType === "HOSPITAL";

  const facts = [
    `${clinic.doctors.length} ${clinic.doctors.length === 1 ? "doctor" : "doctors"}`,
    verified > 0 ? `${verified} verified` : null,
    specialties.length > 0
      ? `${specialties.length} ${isHospital ? "departments" : "specialities"}`
      : null,
  ].filter((fact): fact is string => fact !== null);

  return renderOgCard({
    kind: isHospital ? "Hospital" : "Clinic",
    title: clinic.name,
    subtitle: specialties.slice(0, 3).join(" · ") || null,
    location: [clinic.areaLabel, clinic.city, clinic.state].filter(Boolean).join(", "),
    facts,
  });
}
