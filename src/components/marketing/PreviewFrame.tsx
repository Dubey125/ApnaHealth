import type { ReactNode } from "react";

// A static, non-interactive mockup frame — deliberately not wrapped in any
// <Link>/<button> that would imply real functionality (DESIGN_SYSTEM.md's
// direction: "do not create fake functionality"). The three dots + label
// read as "this is a screenshot," not a live control.
export function PreviewFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-1.5 border-b border-border bg-background px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="ml-2 text-xs font-medium text-muted">{label}</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">{children}</div>
    </div>
  );
}
