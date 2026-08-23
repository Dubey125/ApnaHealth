"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StaffRole } from "@/generated/prisma/enums";
import { staffLogout } from "@/app/login/actions";
import { cn } from "./cn";
import {
  IconOverview,
  IconQueue,
  IconStethoscope,
  IconUsers,
  IconBuilding,
  IconChart,
  IconShield,
  IconCalendar,
  IconUserCircle,
  IconMenu,
  IconClose,
  IconLogout,
} from "./icons";

type IconComponent = (props: { className?: string }) => React.ReactNode;

interface NavLink {
  href: string;
  label: string;
  icon: IconComponent;
}

interface NavSection {
  label: string;
  links: NavLink[];
}

// Grouped so a long flat list doesn't read as an undifferentiated pile —
// still exactly what ACCESS_MATRIX.md grants each role, never a link to a
// page that would reject them.
const SECTIONS_BY_ROLE: Record<StaffRole, NavSection[]> = {
  OWNER: [
    {
      label: "Workspace",
      links: [
        { href: "/app", label: "Overview", icon: IconOverview },
        { href: "/app/sessions", label: "Sessions & queue", icon: IconQueue },
      ],
    },
    {
      label: "Manage",
      links: [
        { href: "/app/doctors", label: "Doctors", icon: IconStethoscope },
        { href: "/app/staff", label: "Staff", icon: IconUsers },
        { href: "/app/clinic", label: "Facility profile", icon: IconBuilding },
      ],
    },
    {
      label: "Insights",
      links: [
        { href: "/app/analytics", label: "Analytics", icon: IconChart },
        { href: "/app/audit", label: "Audit log", icon: IconShield },
      ],
    },
  ],
  DOCTOR: [
    {
      label: "Workspace",
      links: [
        { href: "/app/doctor", label: "Today", icon: IconOverview },
        { href: "/app/doctor/schedule", label: "My schedule", icon: IconCalendar },
      ],
    },
    {
      label: "Manage",
      links: [{ href: "/app/doctor/profile", label: "My profile", icon: IconUserCircle }],
    },
  ],
  FRONT_DESK: [
    {
      label: "Workspace",
      links: [
        { href: "/app", label: "Today", icon: IconOverview },
        { href: "/app/sessions", label: "Sessions & queue", icon: IconQueue },
      ],
    },
  ],
};

const ROLE_LABEL: Record<StaffRole, string> = {
  OWNER: "Owner",
  DOCTOR: "Doctor",
  FRONT_DESK: "Front desk",
};

function useActiveHref(sections: NavSection[]) {
  const pathname = usePathname();
  // Longest match wins, with a "/" boundary, so /app/doctor/schedule
  // highlights only itself and never also /app/doctor — and /app/doctors
  // never matches the pathname /app/doctor.
  return sections
    .flatMap((s) => s.links)
    .filter((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

function NavList({ sections, activeHref, onNavigate }: { sections: NavSection[]; activeHref?: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted/70">{section.label}</div>
          {section.links.map((link) => {
            const active = link.href === activeHref;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted hover:bg-border/40 hover:text-foreground",
                )}
              >
                <Icon className={cn("shrink-0", active ? "text-primary" : "text-muted")} />
                {link.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Identity({ clinicName, role }: { clinicName: string; role: StaffRole }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        A
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-foreground">{clinicName}</span>
        <span className="text-xs text-muted">{ROLE_LABEL[role]}</span>
      </span>
    </div>
  );
}

function SignOut() {
  return (
    <form action={staffLogout} className="border-t border-border p-3">
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-border/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <IconLogout className="shrink-0" />
        Sign out
      </button>
    </form>
  );
}

export function AppSidebar({ role, clinicName }: { role: StaffRole; clinicName: string }) {
  const [open, setOpen] = useState(false);
  const sections = SECTIONS_BY_ROLE[role];
  const activeHref = useActiveHref(sections);

  return (
    <>
      {/* Desktop: persistent rail. */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <Identity clinicName={clinicName} role={role} />
        <NavList sections={sections} activeHref={activeHref} />
        <SignOut />
      </aside>

      {/* Mobile: top bar + slide-over. */}
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <IconMenu />
        </button>
        <span className="truncate text-sm font-semibold">{clinicName}</span>
        <span className="ml-auto rounded-full bg-border/60 px-2 py-0.5 text-xs text-muted">{ROLE_LABEL[role]}</span>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-foreground/30"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border pr-2">
              <div className="min-w-0 flex-1">
                <Identity clinicName={clinicName} role={role} />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-border/40 hover:text-foreground"
              >
                <IconClose />
              </button>
            </div>
            <NavList sections={sections} activeHref={activeHref} onNavigate={() => setOpen(false)} />
            <SignOut />
          </div>
        </div>
      )}
    </>
  );
}
