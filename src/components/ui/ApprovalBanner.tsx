import type { ApprovalStatus } from "@/generated/prisma/enums";
import { Alert } from "./Alert";

// Shown on every staff screen while a facility has not been approved.
//
// A pending facility is deliberately NOT locked out of the app: they can
// add doctors, build a schedule and set up their front desk, so that the
// moment review clears they are ready to see patients. What they cannot do
// is reach patients — public search, doctor profiles and booking links all
// filter on approval (see lib/publicListing.ts). Blocking setup instead
// would just make approval feel like a wall; blocking discovery is the part
// that actually matters.
export function ApprovalBanner({ status, notes }: { status: ApprovalStatus; notes: string | null }) {
  if (status === "APPROVED") return null;

  if (status === "REJECTED") {
    return (
      <div className="px-4 pt-4 sm:px-6">
        <Alert variant="danger">
          <strong className="font-medium">Your facility was not approved for listing.</strong>{" "}
          {notes ?? "Contact ApnaHealth support to find out what is needed."} You can still use ApnaHealth internally, but
          patients can&apos;t find or book you until this is resolved.
        </Alert>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 sm:px-6">
      <Alert variant="warning">
        <strong className="font-medium">Awaiting review by the ApnaHealth team.</strong> Set up your doctors, sessions and
        staff now — everything works. Your facility just won&apos;t appear in patient search or accept public bookings until
        it&apos;s approved.
      </Alert>
    </div>
  );
}
