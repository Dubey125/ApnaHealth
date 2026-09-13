import { requireStaffSession } from "@/lib/auth/staff";
import { prisma } from "@/lib/db";
import { loadClinicBilling } from "@/lib/billing/load";
import { PLAN_PRICE_MINOR, PLAN_SEATS, TRIAL_DAYS, daysRemaining, formatPriceMinor } from "@/lib/billing/subscription";
import { SubscribeButton, CancelSubscriptionButton } from "@/components/billing/SubscribeButton";
import { seatOverage } from "@/lib/billing/entitlements";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatClinicDate } from "@/lib/format";
import type { SubscriptionStatus } from "@/generated/prisma/enums";

export const metadata = { title: "Subscription", robots: { index: false, follow: false } };

const STATUS_VARIANT: Record<SubscriptionStatus, "success" | "warning" | "danger" | "info"> = {
  TRIALING: "info",
  ACTIVE: "success",
  PAST_DUE: "warning",
  SUSPENDED: "danger",
  CANCELLED: "danger",
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIALING: "Free trial",
  ACTIVE: "Active",
  PAST_DUE: "Payment failed",
  SUSPENDED: "Inactive",
  CANCELLED: "Cancelled",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

// Owner-only: a subscription is the clinic's commercial relationship, and
// ACCESS_MATRIX.md keeps commercial and clinical roles separate — a doctor
// or receptionist has no business seeing or changing it.
export default async function BillingPage() {
  const session = await requireStaffSession("OWNER");
  const now = new Date();

  const [billing, doctorCount] = await Promise.all([
    loadClinicBilling(session.clinicId, now),
    prisma.doctor.count({ where: { clinicId: session.clinicId } }),
  ]);
  const { subscription, entitlements } = billing;

  const events = subscription
    ? await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id },
        orderBy: { occurredAt: "desc" },
        take: 20,
      })
    : [];

  const overage = subscription ? seatOverage(doctorCount, subscription.doctorSeats) : 0;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Subscription</h1>
        <p className="text-sm text-muted">Your plan, seats and billing history.</p>
      </div>

      {!subscription ? (
        <EmptyState
          title="No subscription on record"
          description="Your clinic is fully active. Contact us to set up a plan."
        />
      ) : (
        <>
          <Card className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <h2 className="text-base font-semibold text-foreground">{subscription.plan}</h2>
              <Badge variant={STATUS_VARIANT[subscription.status]}>{STATUS_LABEL[subscription.status]}</Badge>
            </div>

            <Row
              label="Doctor seats"
              value={
                <>
                  {doctorCount} of {subscription.doctorSeats} used
                  {overage > 0 && <span className="ml-2 text-danger">{overage} over</span>}
                </>
              }
            />
            {subscription.trialEndsAt && (
              <Row
                label="Trial ends"
                value={`${formatClinicDate(subscription.trialEndsAt)} (${daysRemaining(subscription.trialEndsAt, now)} days)`}
              />
            )}
            {subscription.gracePeriodEndsAt && (
              <Row
                label="Grace period ends"
                value={`${formatClinicDate(subscription.gracePeriodEndsAt)} (${daysRemaining(subscription.gracePeriodEndsAt, now)} days)`}
              />
            )}
            {subscription.currentPeriodEndAt && (
              <Row label="Current period ends" value={formatClinicDate(subscription.currentPeriodEndAt)} />
            )}
          </Card>

          {/* Pay, or stop paying. The price is read from the same constant
              the charge uses, so the number shown can never drift from the
              number taken. */}
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">
                {formatPriceMinor(PLAN_PRICE_MINOR.STARTER ?? 0)}
                <span className="text-sm font-normal text-muted"> per month</span>
              </h2>
              <span className="text-xs text-muted">{PLAN_SEATS.STARTER} doctor seats included</span>
            </div>

            {subscription.status === "ACTIVE" ? (
              <>
                <p className="text-sm text-muted">Your subscription is active. Thank you.</p>
                <CancelSubscriptionButton />
              </>
            ) : subscription.status === "CANCELLED" ? (
              <>
                <p className="text-sm text-muted">Reactivate whenever you are ready — nothing has been deleted.</p>
                <SubscribeButton priceLabel={formatPriceMinor(PLAN_PRICE_MINOR.STARTER ?? 0)} trialDays={TRIAL_DAYS} />
              </>
            ) : (
              <SubscribeButton priceLabel={formatPriceMinor(PLAN_PRICE_MINOR.STARTER ?? 0)} trialDays={TRIAL_DAYS} />
            )}

            <p className="text-xs text-muted">
              By subscribing you agree to our{" "}
              <a href="/terms" className="underline underline-offset-2">
                terms of service
              </a>{" "}
              and{" "}
              <a href="/refunds" className="underline underline-offset-2">
                refund policy
              </a>
              .
            </p>
          </Card>

          {/* Stated plainly, because the guarantee is only worth something
              if the customer knows they have it. This is also the thing
              that makes the product safe to sell into a clinic: a billing
              problem is never a clinical one. */}
          <Card className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-foreground">What keeps working, always</h2>
            <p className="text-sm text-muted">
              Whatever happens to your subscription, every patient already holding a token can still be checked in,
              called, seen and have their consultation recorded. A billing problem will never strand a patient in your
              waiting room.
            </p>
            <ul className="flex flex-col gap-1 pt-1 text-sm">
              <li className="text-foreground">
                <span className="font-medium text-success">Always available</span> — running today&apos;s queue, calling
                patients, consultation records, closing sessions
              </li>
              <li className="text-foreground">
                <span className="font-medium">Needs an active plan</span> — issuing new tokens, taking online bookings,
                scheduling new sessions, adding doctors, analytics
              </li>
            </ul>
            {!entitlements.canIssueTokens && (
              <p className="pt-1 text-sm font-medium text-danger">
                New tokens and bookings are currently paused. Existing patients are unaffected.
              </p>
            )}
          </Card>

          {overage > 0 && (
            <Card className="flex flex-col gap-2 border-warning/40 bg-warning/5">
              <h2 className="text-base font-semibold text-foreground">More doctors than seats</h2>
              <p className="text-sm text-muted">
                You have {doctorCount} doctors and {subscription.doctorSeats} seats. Nothing has been removed — your
                doctors and their patients are unaffected — but you cannot add another until you upgrade.
                {subscription.plan === "STARTER" && ` The GROWTH plan includes ${PLAN_SEATS.GROWTH} seats.`}
              </p>
            </Card>
          )}

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Billing history</h2>
            {events.length === 0 ? (
              <EmptyState title="No changes yet" />
            ) : (
              <ul className="flex flex-col gap-2">
                {events.map((event) => (
                  <li key={event.id}>
                    <Card className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span className="text-foreground">
                        {event.fromStatus ? `${STATUS_LABEL[event.fromStatus]} → ` : ""}
                        {STATUS_LABEL[event.toStatus]}
                        <span className="ml-2 text-muted">{event.reason}</span>
                      </span>
                      <span className="text-xs text-muted">{formatClinicDate(event.occurredAt)}</span>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </main>
  );
}
