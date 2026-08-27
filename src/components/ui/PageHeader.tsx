import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  backHref,
  backLabel = "Back",
  action,
}: {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {backHref && (
        <Link href={backHref} className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
          ← {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {action}
      </div>
      {description && <p className="max-w-2xl text-sm text-muted">{description}</p>}
    </div>
  );
}
