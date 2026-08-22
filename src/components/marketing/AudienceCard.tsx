import Link from "next/link";
import { Card } from "@/components/ui/Card";

export function AudienceCard({
  title,
  bullets,
  ctaLabel,
  ctaHref,
  id,
}: {
  title: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
  id?: string;
}) {
  return (
    <Card id={id} className="flex scroll-mt-20 flex-col gap-4">
      <h3 className="text-lg font-medium text-foreground">{title}</h3>
      <ul className="flex flex-col gap-2 text-sm text-muted">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex items-center gap-2">
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-primary" aria-hidden="true">
              <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {bullet}
          </li>
        ))}
      </ul>
      <Link
        href={ctaHref}
        className="mt-auto inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {ctaLabel}
      </Link>
    </Card>
  );
}
