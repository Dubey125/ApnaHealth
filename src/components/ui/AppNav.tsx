"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StaffRole } from "@/generated/prisma/enums";
import { staffLogout } from "@/app/login/actions";
import { cn } from "./cn";

interface NavLink {
  href: string;
  label: string;
}

// One entry per role, matching exactly what ACCESS_MATRIX.md grants that
// role today — not aspirational links to pages that would reject them.
const LINKS_BY_ROLE: Record<StaffRole, NavLink[]> = {
  OWNER: [
    { href: "/app", label: "Home" },
    { href: "/app/doctors", label: "Doctors" },
    { href: "/app/sessions", label: "Sessions" },
    { href: "/app/staff", label: "Staff" },
    { href: "/app/clinic", label: "Clinic profile" },
    { href: "/app/analytics", label: "Analytics" },
    { href: "/app/audit", label: "Audit log" },
  ],
  DOCTOR: [
    { href: "/app", label: "Home" },
    { href: "/app/doctor", label: "Today's sessions" },
    { href: "/app/doctor/schedule", label: "My schedule" },
    { href: "/app/doctor/profile", label: "My profile" },
  ],
  FRONT_DESK: [
    { href: "/app", label: "Home" },
    { href: "/app/sessions", label: "Sessions" },
  ],
};

export function AppNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  const links = LINKS_BY_ROLE[role];

  // Longest-matching href wins rather than a plain startsWith per link:
  // with nested routes like /app/doctor and /app/doctor/schedule both in
  // the same list, a naive startsWith would highlight both at once on
  // /app/doctor/schedule. A match requires an exact match or a "/"
  // boundary, so /app/doctors never matches pathname /app/doctor either.
  const activeHref = links
    .filter((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
      {links.map((link) => {
        const active = link.href === activeHref;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              active ? "bg-primary text-primary-foreground" : "text-muted hover:bg-border/50 hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
      <form action={staffLogout} className="ml-1">
        <button
          type="submit"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-border/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Sign out
        </button>
      </form>
    </nav>
  );
}
