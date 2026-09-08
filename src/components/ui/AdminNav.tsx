"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";

const LINKS = [
  { href: "/admin", label: "Review queue" },
  { href: "/admin/facilities", label: "Facilities" },
  { href: "/admin/doctors", label: "Doctors" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
];

export function AdminNav() {
  const pathname = usePathname();
  // Longest match wins, so /admin/facilities does not also light up /admin
  // — the same rule AppNav uses.
  const activeHref = LINKS.filter((l) => pathname === l.href || pathname.startsWith(`${l.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0]?.href;

  return (
    <nav aria-label="Admin" className="flex items-center gap-4 text-sm">
      {LINKS.map((link) => {
        const active = link.href === activeHref;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn("transition-colors", active ? "font-medium text-primary" : "text-muted hover:text-foreground")}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
