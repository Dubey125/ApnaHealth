"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "./cn";

interface NavLink {
  href: string;
  label: string;
}

const LINKS: NavLink[] = [{ href: "/doctors", label: "Find a doctor" }];

// SiteHeader (server) had no mobile treatment at all — two links that just
// wrapped at narrow widths. This is the client-side half: a hamburger
// toggle + slide-down panel, split out because the toggle needs local
// state and SiteHeader itself stays a server component (it reads the
// patient session via next/headers, which can't run in a client module).
export function SiteHeaderNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const accountLink: NavLink = signedIn
    ? { href: "/patient/account", label: "My account" }
    : { href: "/patient/login", label: "Patient login" };
  const allLinks = [...LINKS, accountLink];

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-4 text-sm sm:flex">
        {allLinks.map((link) => (
          <Link key={link.href} href={link.href} className="text-muted transition-colors hover:text-foreground">
            {link.label}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:hidden"
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
          "absolute inset-x-0 top-full border-b border-border bg-surface shadow-sm sm:hidden",
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
      </div>
    </>
  );
}
