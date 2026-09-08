import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";
import { formatClinicDate } from "@/lib/format";
import { daysRemaining } from "@/lib/billing/subscription";
import { SubscriptionControls } from "./SubscriptionControls";
import type { SubscriptionStatus } from "@/generated/prisma/enums";

export const metadata = { title: "Subscriptions · Admin" };

const STATUS_VARIANT: Record<SubscriptionStatus, "success" | "warning" | "danger" | "info"> = {
  TRIALING: "info",
  ACTIVE: "success",
  PAST_DUE: "warning",
  SUSPENDED: "danger",
  CANCELLED: "danger",
};

// The commercial view of the customer base: who is paying, who is about
// to lapse, and who has already.
//
// Ordered so the rows that need a human come first. A trial ending in two
// days is a sales conversation and a failed payment is a retention one —
// both are worth more attention than a clinic that is simply paying, and
// a list sorted by name buries them.
const ATTENTION_ORDER: SubscriptionStatus[] = ["PAST_DUE", "TRIALING", "SUSPENDED", "CANCELLED", "ACTIVE"];

export default async function AdminSubscriptionsPage() {
  const now = new Date();
  const subscriptions = await prisma.subscription.findMany({
    include: {
      clinic: { select: { id: true, name: true, city: true, _count: { select: { doctors: true } } } },
    },
    take: 200,
  });

  const rows = [...subscriptions].sort((a, b) => {
    const byStatus = ATTENTION_ORDER.indexOf(a.status) - ATTENTION_ORDER.indexOf(b.status);
    if (byStatus !== 0) return byStatus;
    // Within a status, whoever runs out soonest is most urgent.
    const aDeadline = a.gracePeriodEndsAt ?? a.trialEndsAt;
    const bDeadline = b.gracePeriodEndsAt ?? b.trialEndsAt;
    if (aDeadline && bDeadline) return aDeadline.getTime() - bDeadline.getTime();
    return a.clinic.name.localeCompare(b.clinic.name);
  });

  const paying = subscriptions.filter((s) => s.status === "ACTIVE").length;
  const trialing = subscriptions.filter((s) => s.status === "TRIALING").length;
  const atRisk = subscriptions.filter((s) => s.status === "PAST_DUE").length;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader title="Subscriptions" description="Every clinic's commercial state, most urgent first." />

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-md border border-border px-3 py-1">
          <span className="font-semibold tabular-nums text-foreground">{paying}</span>{" "}
          <span className="text-muted">paying</span>
        </span>
        <span className="rounded-md border border-border px-3 py-1">
          <span className="font-semibold tabular-nums text-foreground">{trialing}</span>{" "}
          <span className="text-muted">on trial</span>
        </span>
        <span className="rounded-md border border-border px-3 py-1">
          <span className="font-semibold tabular-nums text-foreground">{atRisk}</span>{" "}
          <span className="text-muted">payment failed</span>
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No subscriptions yet" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Clinic</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Seats</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((subscription) => {
              const deadline = subscription.gracePeriodEndsAt ?? subscription.trialEndsAt;
              const left = daysRemaining(deadline, now);
              return (
                <TableRow key={subscription.id}>
                  <TableCell>
                    <span className="font-medium text-foreground">{subscription.clinic.name}</span>
                    <span className="block text-xs text-muted">{subscription.clinic.city}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[subscription.status]}>{subscription.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted">{subscription.plan}</TableCell>
                  <TableCell className="tabular-nums text-muted">
                    {subscription.clinic._count.doctors} / {subscription.doctorSeats}
                  </TableCell>
                  <TableCell className="text-muted">
                    {deadline ? (
                      <>
                        {formatClinicDate(deadline)}
                        <span className="block text-xs tabular-nums">{left} days</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <SubscriptionControls clinicId={subscription.clinic.id} status={subscription.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <p className="text-xs text-muted">
        No payment provider is connected. A status change here records a decision a person made — it does not move
        money, and it writes an append-only event naming the admin who made it.
      </p>
    </main>
  );
}
