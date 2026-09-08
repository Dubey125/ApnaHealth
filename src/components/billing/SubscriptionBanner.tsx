import Link from "next/link";
import type { Entitlements } from "@/lib/billing/entitlements";

// Telling the owner where they stand, before it costs them anything.
//
// The whole design of the billing system is that nothing breaks suddenly:
// a failed payment changes no behaviour for a week, and even suspension
// leaves today's list completable. That only works if the clinic is
// actually told — otherwise "nothing broke" just means "nobody noticed
// until it did".
//
// So the banner escalates in tone while the software escalates in
// restriction, and always says what still works. A clinic owner reading
// this mid-OPD needs to know whether to panic, and the answer is almost
// always no.

const STYLES: Record<Exclude<Entitlements["notice"], "none">, { className: string; title: string; body: string }> = {
  trial: {
    className: "border-primary/30 bg-primary/5 text-foreground",
    title: "Free trial",
    body: "Everything is available during your trial.",
  },
  payment_failed: {
    className: "border-warning/40 bg-warning/10 text-foreground",
    title: "Payment didn't go through",
    body: "Nothing has changed yet — your queues, bookings and records all work as normal. Update your payment details before the grace period ends.",
  },
  suspended: {
    className: "border-danger/40 bg-danger/10 text-foreground",
    title: "Subscription inactive",
    body: "You can still run today's queue and see every patient already booked. New tokens, sessions and doctors need an active plan.",
  },
  cancelled: {
    className: "border-danger/40 bg-danger/10 text-foreground",
    title: "Subscription cancelled",
    body: "Patients already in your queue can still be seen. Reactivate to take new bookings.",
  },
};

export function SubscriptionBanner({
  entitlements,
  daysLeft,
}: {
  entitlements: Entitlements;
  daysLeft: number | null;
}) {
  if (entitlements.notice === "none") return null;
  const style = STYLES[entitlements.notice];

  // "1 day left" reads very differently from "13 days left", and an owner
  // deciding whether to act today needs the number, not a status word.
  const deadline =
    daysLeft !== null && (entitlements.notice === "trial" || entitlements.notice === "payment_failed")
      ? ` ${daysLeft} day${daysLeft === 1 ? "" : "s"} left.`
      : "";

  return (
    <div className={`border-b px-4 py-2 text-sm sm:px-6 ${style.className}`} role="status">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <p>
          <span className="font-semibold">{style.title}.</span> {style.body}
          {deadline}
        </p>
        <Link href="/app/billing" className="shrink-0 font-medium underline underline-offset-2">
          Manage subscription
        </Link>
      </div>
    </div>
  );
}
