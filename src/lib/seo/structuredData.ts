import { absoluteUrl, getSiteUrl } from "@/lib/env";

// schema.org JSON-LD for the public directory.
//
// This is the machine-readable half of discovery: Google's Physician,
// MedicalClinic and Hospital types are what turn a doctor page into a rich
// result with an address, a speciality and opening information rather than
// a blue link. For a product whose patients arrive by searching
// "paediatrician near Koregaon Park", that is the difference between being
// found and not.
//
// Three rules hold throughout:
//
//   * Nothing is asserted that the database does not know. No invented
//     ratings, no aggregate review counts, no priceRange guesses. Schema
//     markup that overstates is both a Google policy violation and, on a
//     healthcare directory, a straightforwardly dishonest one.
//   * Verification is never claimed as a credential. A doctor's
//     registration having been checked is recorded, but it is not emitted
//     as an award or accreditation — CLAUDE.md: verification must never be
//     fabricated or treated as automatic truth.
//   * Only listed (approved + active) entities are ever described, because
//     only they have public pages for the markup to point at.

/** A JSON-LD document. Deliberately loose — schema.org shapes vary by type. */
export type JsonLd = Record<string, unknown>;

export interface FacilityForSchema {
  slug: string;
  name: string;
  facilityType: "CLINIC" | "HOSPITAL";
  addressLine: string;
  areaLabel: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  phone: string;
  latitude: number | null;
  longitude: number | null;
}

export interface DoctorForSchema {
  slug: string;
  name: string;
  specialty: string;
  qualificationText: string;
  photoUrl: string | null;
  bio: string | null;
  languagesText: string | null;
  clinic: FacilityForSchema;
}

function postalAddress(facility: FacilityForSchema): JsonLd {
  return {
    "@type": "PostalAddress",
    streetAddress: [facility.addressLine, facility.areaLabel].filter(Boolean).join(", "),
    addressLocality: facility.city,
    addressRegion: facility.state,
    ...(facility.postalCode ? { postalCode: facility.postalCode } : {}),
    addressCountry: "IN",
  };
}

// Omitted entirely when the facility has not been geocoded. An empty or
// zeroed geo block is worse than none: 0,0 is a real coordinate.
function geoCoordinates(facility: FacilityForSchema): JsonLd | null {
  if (facility.latitude === null || facility.longitude === null) return null;
  return { "@type": "GeoCoordinates", latitude: facility.latitude, longitude: facility.longitude };
}

export function facilitySchema(facility: FacilityForSchema, specialties: string[] = []): JsonLd {
  const geo = geoCoordinates(facility);
  return {
    "@context": "https://schema.org",
    // Hospital and MedicalClinic are both subtypes of MedicalOrganization;
    // the discriminator we already store maps directly onto them.
    "@type": facility.facilityType === "HOSPITAL" ? "Hospital" : "MedicalClinic",
    "@id": absoluteUrl(`/facilities/${facility.slug}`),
    name: facility.name,
    url: absoluteUrl(`/facilities/${facility.slug}`),
    telephone: facility.phone,
    address: postalAddress(facility),
    ...(geo ? { geo } : {}),
    ...(specialties.length > 0 ? { medicalSpecialty: specialties } : {}),
  };
}

export function doctorSchema(doctor: DoctorForSchema): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Physician",
    "@id": absoluteUrl(`/doctors/${doctor.slug}`),
    name: doctor.name,
    url: absoluteUrl(`/doctors/${doctor.slug}`),
    medicalSpecialty: doctor.specialty,
    // The qualification string as recorded ("MBBS, MD (General Medicine)"),
    // not parsed into structured credentials — splitting it would invent
    // precision the free-text field does not have.
    ...(doctor.qualificationText ? { description: doctor.qualificationText } : {}),
    ...(doctor.bio ? { disambiguatingDescription: doctor.bio } : {}),
    ...(doctor.photoUrl ? { image: doctor.photoUrl } : {}),
    ...(doctor.languagesText
      ? { knowsLanguage: doctor.languagesText.split(",").map((language) => language.trim()).filter(Boolean) }
      : {}),
    address: postalAddress(doctor.clinic),
    ...(geoCoordinates(doctor.clinic) ? { geo: geoCoordinates(doctor.clinic) } : {}),
    // Where they practise, as a nested organization rather than a bare
    // string, so a crawler can connect the doctor page to the facility page.
    worksFor: {
      "@type": doctor.clinic.facilityType === "HOSPITAL" ? "Hospital" : "MedicalClinic",
      "@id": absoluteUrl(`/facilities/${doctor.clinic.slug}`),
      name: doctor.clinic.name,
      url: absoluteUrl(`/facilities/${doctor.clinic.slug}`),
    },
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbSchema(crumbs: Crumb[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

export function organizationSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${getSiteUrl()}/#organization`,
    name: "ApnaHealth",
    url: getSiteUrl(),
    description:
      "Find verified doctors, clinics and hospitals near you, book a digital OPD token, and track the live queue.",
  };
}

/**
 * A site-level SearchAction, which is what lets a search engine offer the
 * directory's own search box. Points at /doctors, the primary discovery
 * route.
 */
export function websiteSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${getSiteUrl()}/#website`,
    url: getSiteUrl(),
    name: "ApnaHealth",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: absoluteUrl("/doctors?name={search_term_string}"),
      },
      "query-input": "required name=search_term_string",
    },
  };
}
