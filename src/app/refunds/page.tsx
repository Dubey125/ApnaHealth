import type { Metadata } from "next";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { LegalPage, Section } from "@/components/legal/LegalPage";
import { PLAN_PRICE_MINOR, TRIAL_DAYS, formatPriceMinor } from "@/lib/billing/subscription";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "When ApnaHealth refunds a subscription payment, and when it does not.",
};

const PRICE = formatPriceMinor(PLAN_PRICE_MINOR.STARTER ?? 0);

// DRAFT — NOT REVIEWED BY A LAWYER.
//
// The owner's instruction was: no refunds once paid, except where the app
// did not work. That is written here honestly rather than buried, because
// a refund policy a customer only discovers when they want a refund is how
// a chargeback happens.
//
// Two things a lawyer needs to check: Indian consumer-protection law may
// override a blanket no-refund clause in some circumstances, and Razorpay's
// own merchant terms require a published, reachable refund policy. Do not
// treat this page as legal advice or as evidence of compliance.
export default function RefundsPage() {
  return (
    <>
      <SiteHeader />
      <LegalPage
        title="Refund Policy"
        updated="13 September 2026"
        intro="The short version: try it free first, because we generally do not refund a month you have already paid for — but if the service genuinely failed and we could not fix it, we will make it right."
      >
        <Section title="Try before you pay">
          <p>
            Every new clinic gets {TRIAL_DAYS} days free. Nothing is charged during the trial, no card is taken until
            you choose to subscribe, and you can walk away before it ends having paid nothing.
          </p>
          <p className="font-medium text-foreground">
            The trial exists so that you never have to ask for a refund. Please use it — run a real week of OPD on it
            and decide with evidence.
          </p>
        </Section>

        <Section title="When we do not refund">
          <p>Once a monthly payment has been taken, it is generally not refundable. In particular we do not refund:</p>
          <ul className="ml-5 flex list-disc flex-col gap-1">
            <li>a change of mind, or a decision to switch to another product;</li>
            <li>the unused part of a month after you cancel — cancellation takes effect at the end of the period you already paid for, and you keep full access until then;</li>
            <li>a month in which you simply used the product less than you expected;</li>
            <li>a clinic&apos;s own staffing, connectivity or hardware problems.</li>
          </ul>
          <p>
            The subscription is {PRICE} per month and can be cancelled at any time, so the most you are ever exposed to
            is a single month.
          </p>
        </Section>

        <Section title="When we will refund">
          <p>
            If ApnaHealth did not work and that was our fault, you should not pay for it. We will consider a full or
            partial refund where:
          </p>
          <ul className="ml-5 flex list-disc flex-col gap-1">
            <li>the service was unavailable for a prolonged period during your clinic hours because of a fault on our side;</li>
            <li>a defect in the software prevented you from running your OPD — issuing tokens, calling patients, or recording consultations — and we could not resolve it in reasonable time;</li>
            <li>you were charged in error, charged twice, or charged after cancelling.</li>
          </ul>
          <p>
            A duplicate or erroneous charge is always refunded in full, and you do not need to argue the case for one.
          </p>
        </Section>

        <Section title="What we mean by &ldquo;did not work&rdquo;">
          <p>
            We mean the product failing at what you pay it to do. A slower-than-expected page, a cosmetic bug, or a
            feature behaving differently from how you hoped is not a service failure — tell us and we will fix it.
          </p>
          <p>
            An outage caused by something outside our control — your internet connection, a power cut, or your device —
            is not something we can refund, which is exactly why every clinic must agree a paper fallback before going
            live.
          </p>
        </Section>

        <Section title="How to ask">
          <p>
            Contact us within 30 days of the charge, with your clinic name and roughly when the problem happened. We
            keep operational logs and will look at what actually occurred rather than asking you to prove it.
          </p>
          <p>
            We will respond within five working days. Approved refunds go back to the original payment method through
            Razorpay, usually within 5–10 working days depending on your bank.
          </p>
        </Section>

        <Section title="Your statutory rights">
          <p>
            Nothing in this policy removes rights you have under Indian consumer law. Where the law gives you a remedy
            this policy does not, the law wins.
          </p>
        </Section>
      </LegalPage>
      <Footer />
    </>
  );
}
