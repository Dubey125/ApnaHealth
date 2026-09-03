import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { DistanceFromViewer } from "@/components/discovery/ViewerLocation";
import { CancelAppointmentButton } from "@/app/patient/appointments/CancelAppointmentButton";
import { formatClinicDate, formatClinicDateWithWeekday, formatClinicTime } from "@/lib/format";
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_STATUS_VARIANT, appointmentCtaLabel } from "@/lib/appointmentStatus";
import type { TokenStatus } from "@/generated/prisma/enums";

/** What the queue is doing right now, for an appointment that is still ahead. */
export interface LiveDetail {
  nowServingNumber: number | null;
  tokensAhead: number;
  windowStartAt: Date | null;
  windowEndAt: Date | null;
}

// One appointment, in the three shapes it needs:
//
//   today    — leads with live queue position and the arrival window
//   upcoming — leads with when and where, plus the ability to cancel
//   past     — a record of a visit, linking to the clinical note if one exists
//
// Not a DiscoveryCard: that component's whole design is a card whose
// surface is one link to one destination, and an appointment has several
// competing actions (ticket, directions, call, cancel) with no single
// primary one. Cards with real actions in them are exactly the case the
// stretched-overlay pattern is wrong for.

export interface AppointmentCardData {
  group: "today" | "upcoming" | "past";
  publicId: string;
  tokenNumber: number;
  status: TokenStatus;
  doctorName: string;
  doctorSlug: string;
  specialty: string;
  clinicName: string;
  clinicSlug: string;
  clinicAddressLine: string;
  clinicCity: string;
  clinicPhone: string;
  clinicLatitude: number | null;
  clinicLongitude: number | null;
  locationLabel: string;
  sessionDate: Date;
  plannedStartAt: Date;
  plannedEndAt: Date;
  live: LiveDetail | null;
  hasRecord: boolean;
}

const CANCELLABLE: readonly TokenStatus[] = ["BOOKED", "CHECKED_IN"];

function mapsUrl(data: AppointmentCardData): string {
  const query = encodeURIComponent(`${data.clinicName}, ${data.clinicAddressLine}, ${data.clinicCity}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/**
 * The live line: what the queue is doing right now.
 *
 * Deliberately phrased as a window, never a promise — QUEUE_RULES.md and
 * CLAUDE.md both require it: "Queue time is an estimate; display windows,
 * not exact guarantees."
 */
function LiveQueueStatus({ live, status }: { live: LiveDetail; status: TokenStatus }) {
  const waitingText =
    live.tokensAhead === 0
      ? status === "CHECKED_IN"
        ? "You're next in line"
        : "Nobody is ahead of you"
      : `${live.tokensAhead} ${live.tokensAhead === 1 ? "person" : "people"} ahead of you`;

  return (
    <Alert variant="info" className="flex flex-col gap-1">
      <span className="font-semibold">{waitingText}</span>
      <span className="text-xs">
        {live.nowServingNumber !== null ? `Now serving token #${live.nowServingNumber}. ` : ""}
        {live.windowStartAt && live.windowEndAt
          ? `Expect to be called between ${formatClinicTime(live.windowStartAt)} and ${formatClinicTime(
              live.windowEndAt,
            )}.`
          : "An arrival window will appear once the clinic starts consulting."}
      </span>
    </Alert>
  );
}

export function AppointmentCard({ data }: { data: AppointmentCardData }) {
  const cancellable = CANCELLABLE.includes(data.status);
  const isPast = data.group === "past";

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={`/doctors/${data.doctorSlug}`}
            className="font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
          >
            {data.doctorName}
          </Link>
          <span className="text-sm text-muted">{data.specialty}</span>
        </div>
        <Badge variant={APPOINTMENT_STATUS_VARIANT[data.status]}>{APPOINTMENT_STATUS_LABEL[data.status]}</Badge>
      </div>

      {data.live && <LiveQueueStatus live={data.live} status={data.status} />}

      {data.status === "IN_CONSULT" && (
        <Alert variant="success">
          <span className="font-semibold">The doctor is calling you now.</span> Please go to {data.locationLabel}.
        </Alert>
      )}

      <div className="flex flex-col gap-0.5 text-sm text-muted">
        <span className="flex flex-wrap items-center gap-x-2">
          <Link
            href={`/facilities/${data.clinicSlug}`}
            className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
          >
            {data.clinicName}
          </Link>
          <DistanceFromViewer latitude={data.clinicLatitude} longitude={data.clinicLongitude} />
        </span>
        <span>
          {data.group === "today"
            ? `Today, ${formatClinicTime(data.plannedStartAt)} – ${formatClinicTime(data.plannedEndAt)}`
            : `${formatClinicDateWithWeekday(data.sessionDate)} · ${formatClinicTime(
                data.plannedStartAt,
              )} – ${formatClinicTime(data.plannedEndAt)}`}
          {" · "}
          {data.locationLabel}
        </span>
        <span>Token #{data.tokenNumber}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-sm">
        <Link href={`/t/${data.publicId}`} className="font-medium text-primary underline-offset-2 hover:underline">
          {appointmentCtaLabel(data.status)}
        </Link>

        {/* Directions and the clinic's number matter most on the way to an
            appointment, so they are only offered while one is still ahead. */}
        {!isPast && (
          <>
            <a
              href={mapsUrl(data)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Directions
            </a>
            <a href={`tel:${data.clinicPhone}`} className="font-medium text-primary underline-offset-2 hover:underline">
              Call clinic
            </a>
          </>
        )}

        {data.hasRecord && (
          <Link href="/patient/records" className="font-medium text-primary underline-offset-2 hover:underline">
            View health record
          </Link>
        )}

        {cancellable && (
          <span className="ml-auto">
            <CancelAppointmentButton
              publicId={data.publicId}
              label={`token #${data.tokenNumber} with ${data.doctorName} on ${formatClinicDate(data.sessionDate)}`}
            />
          </span>
        )}
      </div>
    </article>
  );
}
