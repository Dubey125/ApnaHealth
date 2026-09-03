import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rateLimit";
import { reportError } from "@/lib/monitoring";
import { formatDistanceKm } from "@/lib/geo/distance";
import {
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  parseLocationSearchParams,
} from "@/lib/geo/searchParams";
import { findNearbyClinics, findNearbyDoctors, resolveSearchOrigin } from "@/lib/geo/nearby";

// Public, unauthenticated proximity search over the listed directory.
//
// GET /api/discovery/nearby?lat=18.536&lng=73.893&radiusKm=5
// GET /api/discovery/nearby?near=Koregaon%20Park&kind=clinics
//
// What it returns is exactly what the public /doctors page already shows,
// re-sorted by distance — no clinical data, no patient data, no internal
// ids. It exists so the same radius search is reachable from something
// other than a server-rendered page (the display board, a future map view)
// without any of them re-deriving the listing rules.

export const dynamic = "force-dynamic";

const querySchema = z.object({
  kind: z.enum(["doctors", "clinics", "both"]).catch("doctors"),
  specialty: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  facility: z.enum(["CLINIC", "HOSPITAL"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).catch(50),
});

// Unauthenticated and it runs two indexed queries per call, so it is
// limited the way the other public endpoints are. Done here rather than in
// proxy.ts because that file's rate limiter deliberately only covers
// mutating POSTs, and widening it would put every public GET through a
// code path that guards logins.
const RATE_LIMIT = { limit: 60, windowMs: 5 * 60_000 };

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function optional(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export async function GET(request: Request) {
  const rate = checkRateLimit(`api/discovery/nearby:${clientKey(request)}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const url = new URL(request.url);
  const query = querySchema.parse({
    kind: url.searchParams.get("kind") ?? undefined,
    specialty: optional(url.searchParams.get("specialty")),
    name: optional(url.searchParams.get("name")),
    facility: optional(url.searchParams.get("facility")),
    limit: url.searchParams.get("limit") ?? undefined,
  });

  const { origin: browserOrigin, near, radiusKm } = parseLocationSearchParams({
    lat: url.searchParams.get("lat"),
    lng: url.searchParams.get("lng"),
    near: url.searchParams.get("near"),
    radiusKm: url.searchParams.get("radiusKm") ?? url.searchParams.get("radius"),
  });

  try {
    const resolved = await resolveSearchOrigin(browserOrigin, near);
    if (!resolved) {
      return NextResponse.json(
        {
          error: near
            ? "No listed facilities matched that location."
            : "Provide lat and lng, or a near= place name.",
          radius: { defaultKm: DEFAULT_RADIUS_KM, minKm: MIN_RADIUS_KM, maxKm: MAX_RADIUS_KM },
        },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const { origin, anchor } = resolved;
    const wantsDoctors = query.kind === "doctors" || query.kind === "both";
    const wantsClinics = query.kind === "clinics" || query.kind === "both";

    const [doctors, clinics] = await Promise.all([
      wantsDoctors
        ? findNearbyDoctors({
            origin,
            radiusKm,
            filters: { specialty: query.specialty, name: query.name, facility: query.facility },
            limit: query.limit,
          })
        : Promise.resolve([]),
      wantsClinics
        ? findNearbyClinics({
            origin,
            radiusKm,
            filters: { name: query.name, specialty: query.specialty, facility: query.facility },
            limit: query.limit,
          })
        : Promise.resolve([]),
    ]);

    return NextResponse.json(
      {
        // Echoed back so a client can show what was actually searched —
        // and can see that the coordinates were coarsened before use.
        origin: { latitude: origin.latitude, longitude: origin.longitude, source: anchor ? "place" : "device" },
        matchedPlace: anchor ? { label: anchor.label, kind: anchor.kind } : null,
        radiusKm,
        doctors: doctors.map(({ item, distanceKm }) => ({
          // slug, not id: internal ids never go into a public payload
          // any more than they go into a public URL.
          slug: item.slug,
          name: item.name,
          specialty: item.specialty,
          qualificationText: item.qualificationText,
          experienceYears: item.experienceYears,
          consultationFeeMinor: item.consultationFeeMinor,
          verificationStatus: item.verificationStatus,
          photoUrl: item.photoUrl,
          clinic: {
            name: item.clinic.name,
            facilityType: item.clinic.facilityType,
            areaLabel: item.clinic.areaLabel,
            city: item.clinic.city,
          },
          distanceKm: Number(distanceKm.toFixed(2)),
          distanceLabel: formatDistanceKm(distanceKm),
          profileUrl: `/doctors/${item.slug}`,
        })),
        clinics: clinics.map(({ item, distanceKm }) => ({
          slug: item.slug,
          name: item.name,
          facilityType: item.facilityType,
          addressLine: item.addressLine,
          areaLabel: item.areaLabel,
          city: item.city,
          state: item.state,
          postalCode: item.postalCode,
          phone: item.phone,
          doctorCount: item._count.doctors,
          distanceKm: Number(distanceKm.toFixed(2)),
          distanceLabel: formatDistanceKm(distanceKm),
          profileUrl: `/facilities/${item.slug}`,
        })),
      },
      {
        headers: {
          // The response is derived from where the caller is standing, so
          // it must never be stored by a shared cache or a CDN.
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    // Deliberately no coordinates in the log context: the patient's
    // position is the one thing this endpoint sees that must not be
    // written down anywhere (CLAUDE.md: no sensitive information in logs).
    reportError(error, { path: "/api/discovery/nearby", kind: query.kind });
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 503 });
  }
}
