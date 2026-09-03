import Link from "next/link";
import { requirePatientSession } from "@/lib/auth/patient";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PollingRefresher } from "@/components/PollingRefresher";
import { ViewerLocationProvider, ShowDistancesButton } from "@/components/discovery/ViewerLocation";
import {
  AppointmentCard,
  type AppointmentCardData,
  type LiveDetail,
} from "@/components/patient/AppointmentCard";
import { clinicDayBounds } from "@/lib/clinicDay";
import { computeAndSnapshotPrediction } from "@/lib/prediction/computeForToken";
import { servedBeforeWhere } from "@/lib/queue/ordering";
import { isUpcomingAppointmentStatus } from "@/lib/appointmentStatus";

// The patient's appointment centre.
//
// "Appointment" here is still a self-booked Token (source: SELF_BOOK)
// joined through its Session — there is no separate Appointment entity, per
// the Appointment model design note. What changed is what this page does
// with them.
//
// It used to be two flat lists, Upcoming and Past, each row a static badge
// linking to the ticket page. That answered "what have I booked" but not
// the question a patient actually opens this page to ask, which is "what is
// happening with my care right now" — for that they had to click into the
// ticket to find out they were fourth in line.
//
// So the page now leads with TODAY, and today's appointments carry their
// live queue position and predicted window inline, refreshed by the same
// polling the ticket page uses. Upcoming and Past sit below, unchanged in
// substance.
//
// Scoped to session.patientId only, same boundary as /patient/records. No
// clinical data is read here, so no RecordAccessEvent is written —
// PRIVACY_BOUNDARY.md's access log is about consultation records, not
// booking status, which /t/[publicId] already shows unauthenticated.

// A live prediction is computed per token and writes a PredictionSnapshot
// (QUEUE_RULES.md: snapshot each prediction shown to a patient). That is a
// handful of queries each, so it runs only for today's still-active
// appointments — in practice one, occasionally two.
const MAX_LIVE_PREDICTIONS = 4;

export default async function PatientAppointmentsPage() {
  const session = await requirePatientSession();
  const now = new Date();
  const { start: dayStart, end: dayEnd } = clinicDayBounds(now);

  const tokens = await prisma.token.findMany({
    where: { patientId: session.patientId, source: "SELF_BOOK" },
    include: { session: { include: { doctor: true, clinic: true } } },
    orderBy: { issuedAt: "desc" },
  });

  // Three buckets, in the order a patient cares about them.
  //
  // "Today" is decided by the session's planned window overlapping the
  // clinic day rather than by sessionDate, which is a date-only marker and
  // has already caused an off-by-one on this codebase's other pages.
  const isToday = (plannedStartAt: Date, plannedEndAt: Date) =>
    plannedStartAt < dayEnd && plannedEndAt >= dayStart;

  const active = tokens.filter(
    (t) => isUpcomingAppointmentStatus(t.status) && isToday(t.session.plannedStartAt, t.session.plannedEndAt),
  );
  const upcoming = tokens
    .filter(
      (t) => isUpcomingAppointmentStatus(t.status) && !isToday(t.session.plannedStartAt, t.session.plannedEndAt),
    )
    .sort((a, b) => a.session.plannedStartAt.getTime() - b.session.plannedStartAt.getTime());
  const past = tokens.filter((t) => !isUpcomingAppointmentStatus(t.status));

  const today = active.sort((a, b) => a.session.plannedStartAt.getTime() - b.session.plannedStartAt.getTime());

  // Live queue detail for today's appointments: where the queue has got to,
  // how many are ahead, and when to expect to be called.
  const liveDetails = new Map<string, LiveDetail>();
  for (const token of today.slice(0, MAX_LIVE_PREDICTIONS)) {
    const sessionIsRunning = token.session.status === "OPEN" || token.session.status === "IN_PROGRESS";
    if (!sessionIsRunning || token.status === "IN_CONSULT") continue;

    const [prediction, nowServing, ahead] = await Promise.all([
      computeAndSnapshotPrediction(token.id),
      prisma.token.findFirst({
        where: { sessionId: token.sessionId, status: "IN_CONSULT" },
        select: { tokenNumber: true },
      }),
      prisma.token.count({
        // Effective queue order — see the same count on the ticket page.
        where: { sessionId: token.sessionId, status: "CHECKED_IN", ...servedBeforeWhere(token) },
      }),
    ]);

    liveDetails.set(token.id, {
      nowServingNumber: nowServing?.tokenNumber ?? null,
      tokensAhead: ahead,
      windowStartAt: prediction?.windowStartAt ?? null,
      windowEndAt: prediction?.windowEndAt ?? null,
    });
  }

  // Past visits link to the record when the clinician has written one.
  // Counted rather than read: this page must not touch clinical content.
  const pastTokenIds = past.map((t) => t.id);
  const recordedTokenIds = new Set(
    pastTokenIds.length > 0
      ? (
          await prisma.consultationRecord.findMany({
            where: { tokenId: { in: pastTokenIds }, patientId: session.patientId },
            select: { tokenId: true },
          })
        ).map((record) => record.tokenId)
      : [],
  );

  const toCard = (token: (typeof tokens)[number], group: AppointmentCardData["group"]): AppointmentCardData => ({
    group,
    publicId: token.publicId,
    tokenNumber: token.tokenNumber,
    status: token.status,
    doctorName: token.session.doctor.name,
    doctorSlug: token.session.doctor.slug,
    specialty: token.session.doctor.specialty,
    clinicName: token.session.clinic.name,
    clinicSlug: token.session.clinic.slug,
    clinicAddressLine: token.session.clinic.addressLine,
    clinicCity: token.session.clinic.city,
    clinicPhone: token.session.clinic.phone,
    clinicLatitude: token.session.clinic.latitude,
    clinicLongitude: token.session.clinic.longitude,
    locationLabel: token.session.locationLabel,
    sessionDate: token.session.sessionDate,
    plannedStartAt: token.session.plannedStartAt,
    plannedEndAt: token.session.plannedEndAt,
    live: liveDetails.get(token.id) ?? null,
    hasRecord: recordedTokenIds.has(token.id),
  });

  const nothingAtAll = tokens.length === 0;
  // Polling only earns its keep while something is actually moving.
  const shouldPoll = liveDetails.size > 0 || today.some((t) => t.status === "IN_CONSULT");

  return (
    <>
      <SiteHeader />
      {shouldPoll && <PollingRefresher />}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6">
        <PageHeader title="My appointments" backHref="/patient/account" backLabel="Account" />

        {/* Distances are measured in the browser against each clinic's
            published coordinates — the patient's position is never sent. */}
        <ViewerLocationProvider>
          {nothingAtAll ? (
            <EmptyState
              title="No appointments yet"
              description="Find a doctor, clinic or hospital near you and book a digital token — no queueing at the counter."
              action={
                <Link
                  href="/doctors"
                  className="mt-2 inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Find care near you
                </Link>
              }
            />
          ) : (
            <>
              {today.length > 0 && (
                <section className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Today</h2>
                    <ShowDistancesButton label="Show how far each clinic is" />
                  </div>
                  <ul className="flex flex-col gap-3">
                    {today.map((token) => (
                      <li key={token.id}>
                        <AppointmentCard data={toCard(token, "today")} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Upcoming</h2>
                {upcoming.length === 0 ? (
                  <EmptyState
                    title={today.length > 0 ? "Nothing else booked" : "No upcoming appointments"}
                    description="Book a token with a doctor to see it here."
                    action={
                      <Link href="/doctors" className="mt-1 text-sm text-primary underline underline-offset-2">
                        Find care near you
                      </Link>
                    }
                  />
                ) : (
                  <ul className="flex flex-col gap-3">
                    {upcoming.map((token) => (
                      <li key={token.id}>
                        <AppointmentCard data={toCard(token, "upcoming")} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {past.length > 0 && (
                <section className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Past</h2>
                  <ul className="flex flex-col gap-3">
                    {past.map((token) => (
                      <li key={token.id}>
                        <AppointmentCard data={toCard(token, "past")} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </ViewerLocationProvider>
      </main>
    </>
  );
}
