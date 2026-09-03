import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getPatientSession } from "@/lib/auth/patient";
import { CancelButton } from "./CancelButton";
import { TicketActions } from "./TicketActions";
import { PollingRefresher } from "@/components/PollingRefresher";
import { QueueJourney } from "@/components/queue/QueueJourney";
import { TokenSlipPrintView } from "@/components/queue/TokenSlipPrintView";
import { computeAndSnapshotPrediction } from "@/lib/prediction/computeForToken";
import { QUEUE_ORDER_BY, servedBeforeWhere } from "@/lib/queue/ordering";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { Badge } from "@/components/ui/Badge";
import { Alert, type AlertVariant } from "@/components/ui/Alert";
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_STATUS_VARIANT } from "@/lib/appointmentStatus";
import type { TokenStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface TicketPageProps {
  params: Promise<{ publicId: string }>;
}

const STATUS_MESSAGE: Record<TokenStatus, string> = {
  BOOKED: "Your digital OPD serial is confirmed. Track live queue progress and arrival window here.",
  CHECKED_IN: "Checked in at reception. Please wait near the consultation room; we'll alert you when it's your turn.",
  IN_CONSULT: "Doctor is calling you now! Please enter the consultation room.",
  COMPLETED: "Your consultation is complete. Prescription and doctor advice are available in your health records.",
  NO_SHOW: "This token was marked as a no-show by reception.",
  CANCELLED: "This token has been cancelled.",
};

const STATUS_ALERT_VARIANT: Record<TokenStatus, AlertVariant> = {
  BOOKED: "info",
  CHECKED_IN: "info",
  IN_CONSULT: "success",
  COMPLETED: "success",
  NO_SHOW: "danger",
  CANCELLED: "danger",
};

export default async function TicketPage({ params }: TicketPageProps) {
  const { publicId } = await params;

  const token = await prisma.token.findUnique({
    where: { publicId },
    include: { session: { include: { doctor: true, clinic: true } } },
  });
  if (!token) {
    notFound();
  }

  const cancellable = token.status === "BOOKED" || token.status === "CHECKED_IN";

  // An appointment attached to an account can only be cancelled by that
  // account holder, signed in — this link gets shared on WhatsApp so family
  // can watch the queue, and watching is not the same permission as
  // cancelling. A walk-in token has no owner, so the link is the only
  // credential its holder has, and it stays sufficient. The server action
  // enforces this; the UI just avoids offering a button that will be
  // refused.
  const viewer = token.patientId !== null ? await getPatientSession() : null;
  const viewerOwnsToken = token.patientId !== null && viewer?.patientId === token.patientId;
  const canCancelHere = cancellable && (token.patientId === null || viewerOwnsToken);
  const [prediction, nowServing, ahead] = await Promise.all([
    cancellable ? computeAndSnapshotPrediction(token.id) : Promise.resolve(null),
    cancellable
      ? prisma.token.findFirst({
          where: { sessionId: token.sessionId, status: "IN_CONSULT" },
          select: { tokenNumber: true },
        })
      : Promise.resolve(null),
    cancellable
      ? prisma.token.findMany({
          // Effective queue order, not token order. A patient the front
          // desk moved forward keeps their number, so counting by number
          // would tell everyone behind them that a patient still ahead of
          // them had already been seen.
          where: { sessionId: token.sessionId, status: "CHECKED_IN", ...servedBeforeWhere(token) },
          select: { tokenNumber: true },
          orderBy: QUEUE_ORDER_BY,
        })
      : Promise.resolve([]),
  ]);

  const lastUpdatedAt = new Date();

  return (
    <>
      <div className="no-print">
        <SiteHeader />
      </div>

      {cancellable && <PollingRefresher />}

      {/* Hidden printable thermal token slip */}
      <TokenSlipPrintView
        data={{
          tokenNumber: token.tokenNumber,
          clinicName: token.session.clinic.name,
          doctorName: token.session.doctor.name,
          doctorSpecialty: token.session.doctor.specialty,
          locationLabel: token.session.locationLabel,
          sessionDate: token.session.sessionDate,
          patientName: token.patientNameSnapshot,
          patientPhone: token.patientPhoneSnapshot,
          source: token.source,
          issuedAt: token.issuedAt,
          estimatedWindowStart: prediction?.windowStartAt ?? null,
          estimatedWindowEnd: prediction?.windowEndAt ?? null,
        }}
      />

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-5 px-4 py-8 sm:px-6 no-print">
        {/* Token Number Card */}
        <div className="flex flex-col items-center gap-2 text-center rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/10 via-surface to-surface p-6 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">Your OPD Token</span>
          <h1 className="text-7xl font-black tabular-nums leading-none text-foreground tracking-tight">
            <span className="sr-only">Token </span>#{token.tokenNumber}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={APPOINTMENT_STATUS_VARIANT[token.status]}>
              {APPOINTMENT_STATUS_LABEL[token.status]}
            </Badge>
            <span className="text-xs text-muted">· {token.patientNameSnapshot}</span>
          </div>
        </div>

        {/* Doctor & Location Details */}
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-sm">
          <div className="flex justify-between items-start">
            <div>
              <div className="font-bold text-foreground">{token.session.doctor.name}</div>
              <div className="text-xs font-medium text-primary">{token.session.doctor.specialty}</div>
            </div>
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {token.session.locationLabel}
            </span>
          </div>
          <div className="text-xs text-muted">
            {token.session.clinic.name} · {token.session.clinic.addressLine}, {token.session.clinic.city}
          </div>
          <div className="mt-1 border-t border-border pt-2 text-xs text-muted flex justify-between">
            <span>{formatClinicDate(token.session.sessionDate)}</span>
            <span>
              {formatClinicTime(token.session.plannedStartAt)} – {formatClinicTime(token.session.plannedEndAt)}
            </span>
          </div>
        </div>

        {/* Status Alert Banner */}
        <Alert variant={STATUS_ALERT_VARIANT[token.status]} className="text-center font-medium">
          {STATUS_MESSAGE[token.status]}
        </Alert>

        {/* Live Queue Journey Visualizer */}
        {prediction && (
          <QueueJourney
            myTokenNumber={token.tokenNumber}
            nowServingNumber={nowServing?.tokenNumber ?? null}
            aheadNumbers={ahead.map((t) => t.tokenNumber)}
            windowStartAt={prediction.windowStartAt}
            windowEndAt={prediction.windowEndAt}
            relevantBreak={prediction.relevantBreak}
          />
        )}

        {/* Quick Actions (Share on WhatsApp, Print OPD slip, Maps, Call) */}
        <TicketActions
          tokenNumber={token.tokenNumber}
          doctorName={token.session.doctor.name}
          clinicName={token.session.clinic.name}
          clinicAddress={token.session.clinic.addressLine}
          clinicCity={token.session.clinic.city}
          clinicPhone={token.session.clinic.phone}
          publicId={token.publicId}
        />

        {cancellable && (
          <div className="flex flex-col items-center gap-2 pt-2">
            <p className="text-center text-xs text-muted flex items-center gap-1.5" role="status" aria-live="polite">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse"></span>
              Live tracker · Last updated {formatClinicTime(lastUpdatedAt)}
            </p>
            {canCancelHere ? (
              <CancelButton publicId={token.publicId} />
            ) : (
              <p className="text-center text-xs text-muted">
                To cancel this appointment,{" "}
                <Link href="/patient/appointments" className="text-primary underline underline-offset-2">
                  sign in and open My appointments
                </Link>
                .
              </p>
            )}
          </div>
        )}
      </main>

      <div className="no-print">
        <Footer />
      </div>
    </>
  );
}
