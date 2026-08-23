import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CancelButton } from "./CancelButton";
import { PollingRefresher } from "@/components/PollingRefresher";
import { QueueJourney } from "@/components/queue/QueueJourney";
import { computeAndSnapshotPrediction } from "@/lib/prediction/computeForToken";
import { formatClinicDate, formatClinicTime } from "@/lib/format";
import { SiteHeader } from "@/components/ui/SiteHeader";
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
  BOOKED: "You're booked — come back here to track your place in line.",
  CHECKED_IN: "Checked in. We'll update this page as the queue moves.",
  IN_CONSULT: "It's your turn now — please go in.",
  COMPLETED: "Your consultation is complete.",
  NO_SHOW: "This token was marked as a no-show.",
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

  // Only this patient's own record is queried — no other patient's name or
  // phone is ever fetched or rendered on this page.
  const token = await prisma.token.findUnique({
    where: { publicId },
    include: { session: { include: { doctor: true, clinic: true } } },
  });
  if (!token) {
    notFound();
  }

  const cancellable = token.status === "BOOKED" || token.status === "CHECKED_IN";
  const [prediction, nowServing, ahead] = await Promise.all([
    cancellable ? computeAndSnapshotPrediction(token.id) : Promise.resolve(null),
    // Only the current token's number, never a name or phone — same
    // no-other-patient-PII boundary the rest of this page already
    // respects (QUEUE_RULES.md).
    cancellable
      ? prisma.token.findFirst({ where: { sessionId: token.sessionId, status: "IN_CONSULT" }, select: { tokenNumber: true } })
      : Promise.resolve(null),
    // Token numbers only, for the queue tracker's individual stops — same
    // set the prediction counts as "tokensAhead", so the visible stops and
    // the predicted window always agree.
    cancellable
      ? prisma.token.findMany({
          where: { sessionId: token.sessionId, status: "CHECKED_IN", tokenNumber: { lt: token.tokenNumber } },
          select: { tokenNumber: true },
          orderBy: { tokenNumber: "asc" },
        })
      : Promise.resolve([]),
  ]);
  // Captured once, after every query above has resolved, so it reflects
  // when this data actually became stale — not when the request started.
  // Each poll (PollingRefresher) re-runs this whole server component, so
  // this naturally advances on its own with no client-side clock needed.
  const lastUpdatedAt = new Date();

  return (
    <>
      <SiteHeader />
      {/* No PollingRefresher inside a Suspense/loading boundary: this route
          has no loading.tsx on purpose, so router.refresh() re-renders in
          place instead of flashing a skeleton every 5s (PHASE-14). */}
      {cancellable && <PollingRefresher />}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-sm text-muted">Your token</span>
          <h1 className="text-6xl font-bold tabular-nums leading-none text-foreground">
            <span className="sr-only">Token </span>#{token.tokenNumber}
          </h1>
          <Badge variant={APPOINTMENT_STATUS_VARIANT[token.status]}>{APPOINTMENT_STATUS_LABEL[token.status]}</Badge>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 text-sm">
          <div className="font-medium text-foreground">{token.session.doctor.name}</div>
          <div className="text-muted">{token.session.doctor.specialty}</div>
          <div className="text-muted">
            {token.session.clinic.name} · {token.session.clinic.addressLine}, {token.session.clinic.city}
          </div>
          <div className="text-muted">{token.session.locationLabel}</div>
          <div className="mt-1 border-t border-border pt-2 text-muted">
            {formatClinicDate(token.session.sessionDate)} · {formatClinicTime(token.session.plannedStartAt)} –{" "}
            {formatClinicTime(token.session.plannedEndAt)}
          </div>
        </div>

        <Alert variant={STATUS_ALERT_VARIANT[token.status]} className="text-center">
          {STATUS_MESSAGE[token.status]}
        </Alert>

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

        {cancellable && (
          <p className="text-center text-xs text-muted" role="status" aria-live="polite">
            Last updated {formatClinicTime(lastUpdatedAt)} · this page updates on its own
          </p>
        )}

        {cancellable && <CancelButton publicId={token.publicId} />}
      </main>
    </>
  );
}
