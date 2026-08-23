"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";
import { IconStethoscope, IconCalendar, IconQueue, IconShield } from "./icons";

type IconComponent = (props: { className?: string }) => React.ReactNode;

interface Tab {
  href: string;
  label: string;
  icon: IconComponent;
  /** Extra path prefixes that should still light this tab up. */
  alsoMatches?: string[];
}

// Mobile-first bottom navigation for a signed-in patient. Patients in India
// are overwhelmingly on phones, and a persistent thumb-reachable bar is the
// pattern they already know from every other app on the device — a top-only
// menu made this read as a website rather than something you use in a
// waiting room.
//
// Hidden on lg+ where the header nav is always visible anyway, and never
// rendered at all for signed-out visitors (nothing here is public).
const TABS: Tab[] = [
  { href: "/doctors", label: "Find", icon: IconStethoscope, alsoMatches: ["/book"] },
  { href: "/patient/appointments", label: "Appointments", icon: IconCalendar },
  { href: "/patient/queue", label: "Queue", icon: IconQueue, alsoMatches: ["/t"] },
  { href: "/patient/records", label: "Records", icon: IconShield },
];

export function PatientTabBar({ activeQueueCount }: { activeQueueCount: number }) {
  const pathname = usePathname();

  const activeHref = TABS.filter((t) => {
    const prefixes = [t.href, ...(t.alsoMatches ?? [])];
    return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  })
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav
      id="patient-tab-bar"
      aria-label="Patient"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {TABS.map((tab) => {
          const active = tab.href === activeHref;
          const Icon = tab.icon;
          const showBadge = tab.href === "/patient/queue" && activeQueueCount > 0;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon />
                  {showBadge && (
                    <span
                      className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground"
                      // The count is already announced in the label below,
                      // so the pill itself is decorative to a screen reader.
                      aria-hidden="true"
                    >
                      {activeQueueCount}
                    </span>
                  )}
                </span>
                <span>
                  {tab.label}
                  {showBadge && <span className="sr-only"> — {activeQueueCount} active</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
