"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";

interface NavLink {
  href: string;
  label: string;
}

// Anchor links into the homepage's audience sections — work from any page
// since Link does a full navigation to "/" plus the hash when not already
// there. Deliberately not separate routes: there's one shared staff login
// (/login) for Owner/Doctor/Front Desk, so "For Doctors"/"For Clinics"
// pointing at distinct pages would imply a role-aware backend this app
// doesn't have. The audience sections do that differentiation instead.
// Shown to signed-out visitors only — once signed in as a patient, these
// marketing anchors stop being useful and PATIENT_LINKS takes over.
const SECTION_LINKS: NavLink[] = [
  { href: "/#for-patients", label: "For Patients" },
  { href: "/#for-doctors", label: "For Doctors" },
  { href: "/#for-clinics", label: "For Clinics" },
  { href: "/#how-it-works", label: "How It Works" },
];

// The signed-in patient's own product nav (Appointment model design note):
// Find Doctors is discovery, Appointments is the patient-facing view of
// self-booked Tokens, Live Queue is whichever appointment is currently
// active (or a "nothing active" landing), Health Records is unchanged.
const PATIENT_LINKS: NavLink[] = [
  { href: "/doctors", label: "Find Doctors" },
  { href: "/patient/appointments", label: "Appointments" },
  { href: "/patient/queue", label: "Live Queue" },
  { href: "/patient/records", label: "Health Records" },
];

export function SiteHeaderNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const accountLink: NavLink = signedIn
    ? { href: "/patient/account", label: "My account" }
    : { href: "/patient/login", label: "Patient login" };
  const sectionLinks = signedIn ? PATIENT_LINKS : SECTION_LINKS;
  const allLinks = [...sectionLinks, accountLink];

  // Only the signed-in product links get an active state — the signed-out
  // set are homepage anchors (/#for-patients), which are all the same
  // route and would otherwise all highlight at once on "/".
  const activeHref = signedIn
    ? sectionLinks
        .filter((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))
        .sort((a, b) => b.href.length - a.href.length)[0]?.href
    : undefined;

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-5 text-sm lg:flex">
        {sectionLinks.map((link) => {
          const active = link.href === activeHref;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "transition-colors",
                active ? "font-medium text-primary" : "text-muted hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="hidden items-center gap-3 lg:flex">
        <Link href={accountLink.href} className="text-sm text-muted transition-colors hover:text-foreground">
          {accountLink.label}
        </Link>
        {!signedIn && (
          <Link
            href="/get-started"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Get Started
          </Link>
        )}
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          )}
        </svg>
      </button>

      <div
        id="mobile-nav-panel"
        className={cn(
          "absolute inset-x-0 top-full border-b border-border bg-surface shadow-sm lg:hidden",
          open ? "flex flex-col" : "hidden",
        )}
      >
        {allLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setOpen(false)}
            className="border-t border-border px-4 py-3 text-sm text-foreground first:border-t-0 hover:bg-border/40"
          >
            {link.label}
          </Link>
        ))}
        {!signedIn && (
          <Link
            href="/get-started"
            onClick={() => setOpen(false)}
            className="border-t border-border px-4 py-3 text-sm font-medium text-primary hover:bg-border/40"
          >
            Get Started
          </Link>
        )}
      </div>
    </>
  );
}
