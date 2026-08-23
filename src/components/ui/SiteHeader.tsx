import Link from "next/link";
import { getPatientSession } from "@/lib/auth/patient";
import { prisma } from "@/lib/db";
import { SiteHeaderNav } from "./SiteHeaderNav";
import { PatientTabBar } from "./PatientTabBar";

// The public/patient side had no persistent navigation at all (same gap
// AppShell fixed for /app/* in Phase 12) — every page was a bare <main>
// with no way back to the homepage. This is the patient-side equivalent:
// a thin, server-rendered header, not a new client bundle. Deliberately
// does not wrap children in its own container, so each page keeps its
// existing max-width/padding. Mobile nav toggle lives in SiteHeaderNav
// (client) since this stays a server component reading next/headers.
// Container widened to max-w-6xl (matching AppShell's header) to fit the
// four-audience nav without crowding — a header wider than the page's own
// content column is a standard, common pattern, not a misalignment.
//
// A signed-in patient additionally gets a bottom tab bar on mobile; the
// body padding that keeps content clear of it is handled in globals.css
// keyed off the bar's id, so no page needs its own layout change.
export async function SiteHeader() {
  const session = await getPatientSession();

  // Drives the Queue tab's badge. Counted, not listed — the tab bar only
  // needs to know whether anything is live, and this runs on every patient
  // page so it stays a single indexed count (Token has @@index([patientId])).
  const activeQueueCount = session
    ? await prisma.token.count({
        where: { patientId: session.patientId, status: { in: ["CHECKED_IN", "IN_CONSULT"] } },
      })
    : 0;

  return (
    <>
      <header className="relative border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="text-base font-semibold tracking-tight text-foreground">
            ApnaHealth
          </Link>
          <SiteHeaderNav signedIn={!!session} />
        </div>
      </header>
      {session && <PatientTabBar activeQueueCount={activeQueueCount} />}
    </>
  );
}
