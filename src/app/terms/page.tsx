import type { Metadata } from "next";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { LegalPage, Section } from "@/components/legal/LegalPage";
import { PLAN_PRICE_MINOR, TRIAL_DAYS, formatPriceMinor } from "@/lib/billing/subscription";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms on which clinics and patients use ApnaHealth.",
};

const PRICE = formatPriceMinor(PLAN_PRICE_MINOR.STARTER ?? 0);

// DRAFT — NOT REVIEWED BY A LAWYER.
//
// These terms were written by the engineering side to be honest and
// readable, and they are not a substitute for the qualified legal review
// that PRIVACY_BOUNDARY.md already requires before any real-patient pilot.
// Several clauses here (liability limits, refund terms, data
// responsibilities under the DPDP Act) are exactly the ones a lawyer will
// want to change. Do not treat this page as legal advice or as evidence of
// compliance.
export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <LegalPage
        title="Terms of Service"
        updated="13 September 2026"
        intro="These terms cover how clinics and patients use ApnaHealth. They are written to be read, not to be impenetrable — if something here seems unfair or unclear, tell us."
      >
        <Section title="1. What ApnaHealth is">
          <p>
            ApnaHealth is a coordination and record-keeping tool for outpatient departments. It helps a clinic run its
            queue, lets patients see roughly when they will be seen, and gives clinicians a place to record a
            consultation.
          </p>
          <p className="font-medium text-foreground">
            It is not a medical device, it does not give medical advice, and it never makes a clinical decision. Every
            clinical judgement — diagnosis, treatment, prescription, who is seen first — is made by a qualified
            healthcare professional. The software records those decisions; it does not make them.
          </p>
        </Section>

        <Section title="2. Queue times are estimates">
          <p>
            Predicted consultation windows are estimates based on how long consultations have actually taken, and they
            change as the day changes. They are shown as a window, never as a guaranteed time, and we do not promise
            any patient will be seen within one. A clinic day can be disrupted by an emergency, and it should be.
          </p>
        </Section>

        <Section title="3. Who is responsible for what">
          <p>
            <strong className="text-foreground">The clinic</strong> is responsible for the accuracy of what it enters:
            its own details, its doctors&apos; credentials, appointment and consultation records, and how it treats the
            patients in its care. The clinic is the custodian of its patients&apos; medical records.
          </p>
          <p>
            <strong className="text-foreground">ApnaHealth</strong> is responsible for operating the software, keeping
            clinic data separated from every other clinic&apos;s, and handling it as described in our privacy notice.
          </p>
          <p>
            A doctor being listed as verified means a human at ApnaHealth checked a registration number against a named
            source on a recorded date. It is not an endorsement of that doctor, and it is not a guarantee of the care
            they provide.
          </p>
        </Section>

        <Section title="4. Accounts and access">
          <p>
            Staff accounts are personal. Do not share a login — the audit trail attributes every action to the account
            that performed it, and a shared account makes that record useless to you as much as to us. Tell us promptly
            if you think an account has been compromised.
          </p>
          <p>
            Access to a patient&apos;s medical record is limited to the clinicians involved in their care, and every
            such access is logged.
          </p>
        </Section>

        <Section title="5. Subscription and payment">
          <p>
            Clinic subscriptions cost {PRICE} per month, including {TRIAL_DAYS} days free at the start. Nothing is
            charged during the trial, and you can cancel before it ends at no cost.
          </p>
          <p>
            Payments are handled by Razorpay. We never see or store your card details. Billing recurs monthly until you
            cancel; cancelling takes effect at the end of the period you have already paid for, and you keep full access
            until then.
          </p>
          <p>
            Refunds are covered by our{" "}
            <a href="/refunds" className="underline underline-offset-2">
              refund policy
            </a>
            .
          </p>
        </Section>

        <Section title="6. If you stop paying">
          <p className="font-medium text-foreground">
            A billing problem will never strand a patient in your waiting room.
          </p>
          <p>
            If a payment fails, nothing changes for a grace period — your queues, bookings and records all keep working
            while you sort it out. If the subscription then lapses, you can still check in, call, see and record every
            patient who already holds a token. What stops is issuing new tokens, taking new online bookings, scheduling
            new sessions and adding doctors.
          </p>
          <p>
            We do this because your patients are not party to our commercial relationship with you, and they should
            never be the leverage in it.
          </p>
        </Section>

        <Section title="7. Availability">
          <p>
            We work to keep ApnaHealth available, but we do not currently offer a contractual uptime guarantee, and it
            would be dishonest to print one we have not yet measured. Software fails, networks fail, and hosting
            providers fail.
          </p>
          <p className="font-medium text-foreground">
            Every clinic must have a workable paper fallback for running a session when this software is unavailable,
            agreed before the first patient is booked. We will help you design one. Do not make ApnaHealth the only way
            your clinic can operate.
          </p>
        </Section>

        <Section title="8. Your data">
          <p>
            Clinic and patient data belongs to the clinic and the patient, not to us. We process it to run the service.
            While your subscription is active you can export your own operational data from the analytics page.
          </p>
          <p>
            We do not sell data, and we do not use identifiable patient data for advertising. Aggregated, anonymised
            statistics may be used to improve the queue prediction.
          </p>
        </Section>

        <Section title="9. Acceptable use">
          <p>
            Do not use ApnaHealth to enter false information about a doctor&apos;s qualifications, to access records of
            patients not in your care, to attempt to reach another clinic&apos;s data, or to probe the service for
            vulnerabilities without contacting us first. If you find a security issue, please tell us — we would much
            rather hear it from you.
          </p>
        </Section>

        <Section title="10. Ending the agreement">
          <p>
            You can cancel at any time from your subscription page. We may suspend or end an account that breaches these
            terms, that puts patient safety or data at risk, or for repeated non-payment — and even then, patients
            already in your queue can still be seen.
          </p>
        </Section>

        <Section title="11. Liability">
          <p>
            ApnaHealth is a coordination tool. We are not liable for clinical decisions, for the care a clinic provides,
            or for the accuracy of information a clinic enters. To the extent the law allows, our total liability for
            any claim is limited to the subscription fees you paid us in the twelve months before it arose.
          </p>
          <p>
            Nothing in these terms limits liability that cannot lawfully be limited — including for death or personal
            injury caused by negligence, or for fraud.
          </p>
        </Section>

        <Section title="12. Changes and governing law">
          <p>
            We may update these terms. If a change materially affects you, we will tell you before it takes effect, and
            continuing to use the service after that means you accept it.
          </p>
          <p>These terms are governed by the laws of India, and the courts of India have jurisdiction.</p>
        </Section>

        <Section title="13. Contact">
          <p>Questions about these terms, a billing problem, or a security issue: contact us through your clinic&apos;s account manager or the address given at sign-up.</p>
        </Section>
      </LegalPage>
      <Footer />
    </>
  );
}
