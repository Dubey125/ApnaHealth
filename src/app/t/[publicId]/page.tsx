import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CancelButton } from "./CancelButton";
import { PollingRefresher } from "@/components/PollingRefresher";
import { computeAndSnapshotPrediction } from "@/lib/prediction/computeForToken";
import { formatClinicTime } from "@/lib/format";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { TokenStatusBadge } from "@/components/ui/StatusBadge";
import { Alert, type AlertVariant } from "@/components/ui/Alert";
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
  const prediction = cancellable ? await computeAndSnapshotPrediction(token.id) : null;

  return (
    <>
      <SiteHeader />
      {/* No PollingRefresher inside a Suspense/loading boundary: this route
          has no loading.tsx on purpose, so router.refresh() re-renders in
          place instead of flashing a skeleton every 5s (PHASE-14). */}
      {cancellable && <PollingRefresher />}
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-sm text-muted">Your token</span>
          <h1 className="text-6xl font-bold tabular-nums leading-none text-foreground">
            <span className="sr-only">Token </span>#{token.tokenNumber}
          </h1>
          <TokenStatusBadge status={token.status} />
        </div>

        <div className="rounded-lg border border-border bg-surface p-4 text-sm">
          <div className="font-medium">{token.session.doctor.name}</div>
          <div className="text-muted">
            {token.session.clinic.name} · {token.session.locationLabel}
          </div>
        </div>

        <Alert variant={STATUS_ALERT_VARIANT[token.status]} className="text-center">
          {STATUS_MESSAGE[token.status]}
        </Alert>

        {prediction && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-center">
            {prediction.tokensAhead > 0 ? (
              <div>
                <div className="text-3xl font-bold tabular-nums text-foreground">{prediction.tokensAhead}</div>
                <div className="text-sm text-muted">
                  {prediction.tokensAhead === 1 ? "person" : "people"} ahead of you
                </div>
              </div>
            ) : (
              <div className="text-sm font-medium text-foreground">You&apos;re next in line</div>
            )}

            <div className="border-t border-border pt-3">
              <div className="text-xs text-muted">Estimated arrival window</div>
              <div className="text-lg font-medium tabular-nums text-foreground">
                {formatClinicTime(prediction.windowStartAt)} – {formatClinicTime(prediction.windowEndAt)}
              </div>
              <div className="mt-1 text-xs text-muted">This is an estimate, not a guarantee.</div>
            </div>
          </div>
        )}

        {prediction?.relevantBreak && (
          <Alert variant="warning">
            The doctor has a scheduled break from {formatClinicTime(prediction.relevantBreak.startAt)} to{" "}
            {formatClinicTime(prediction.relevantBreak.endAt)}. Your estimate above already accounts for it.
          </Alert>
        )}

        {cancellable && <CancelButton publicId={token.publicId} />}
      </main>
    </>
  );
}
