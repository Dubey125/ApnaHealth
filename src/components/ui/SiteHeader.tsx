import Link from "next/link";
import { getPatientSession } from "@/lib/auth/patient";
import { SiteHeaderNav } from "./SiteHeaderNav";

// The public/patient side had no persistent navigation at all (same gap
// AppShell fixed for /app/* in Phase 12) — every page was a bare <main>
// with no way back to the homepage. This is the patient-side equivalent:
// a thin, server-rendered header, not a new client bundle. Deliberately
// does not wrap children in its own container, so each page keeps its
// existing max-width/padding. Mobile nav toggle lives in SiteHeaderNav
// (client) since this stays a server component reading next/headers.
export async function SiteHeader() {
  const session = await getPatientSession();

  return (
    <header className="relative border-b border-border bg-surface">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="text-base font-semibold tracking-tight text-foreground">
          ApnaHealth
        </Link>
        <SiteHeaderNav signedIn={!!session} />
      </div>
    </header>
  );
}
