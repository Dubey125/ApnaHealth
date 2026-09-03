import { prisma } from "@/lib/db";
import { LISTED_DOCTOR } from "@/lib/publicListing";
import { formatFeeMinor } from "@/lib/format";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/seo/ogImage";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Doctor profile on ApnaHealth";

// Generated per doctor at request time. Goes through LISTED_DOCTOR like
// every other public read: an unlisted doctor gets the generic card, never
// their details, since an OG image is fetched by anyone with the URL.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  // Awaited, not read directly: params is a Promise in Next 16, and
  // `params.slug` on the Promise is undefined — which Prisma treats as "no
  // constraint", so this route happily returned a different doctor's card
  // for every URL until this was fixed.
  const { slug } = await params;
  const doctor = await prisma.doctor.findFirst({
    where: { slug, ...LISTED_DOCTOR },
    include: { clinic: true },
  });

  if (!doctor) {
    return renderOgCard({ kind: "ApnaHealth", title: "Find verified doctors near you" });
  }

  const facts = [
    doctor.verificationStatus === "VERIFIED" ? "Registration verified" : null,
    doctor.experienceYears != null ? `${doctor.experienceYears} years experience` : null,
    doctor.consultationFeeMinor != null ? `${formatFeeMinor(doctor.consultationFeeMinor)} consultation` : null,
  ].filter((fact): fact is string => fact !== null);

  return renderOgCard({
    kind: "Doctor",
    title: doctor.name,
    subtitle: doctor.specialty,
    location: [doctor.clinic.name, doctor.clinic.areaLabel, doctor.clinic.city].filter(Boolean).join(" · "),
    facts,
  });
}
