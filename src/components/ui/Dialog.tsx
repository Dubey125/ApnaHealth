"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

// Native <dialog> — free focus-trapping and Escape-to-close, no headless
// -UI dependency needed (DESIGN_SYSTEM.md: no new runtime dependencies).
// First wired in by PHASE-16 (the front-desk waiting list renders one
// Dialog per row for the no-show/cancel confirmation step), which is why
// the title id is generated per-instance via useId() rather than the
// hardcoded "dialog-title" this had while unused — a hardcoded id would
// collide across every row's dialog and break aria-labelledby for all but
// the first.
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby={titleId}
      className="w-[calc(100%-2rem)] max-w-sm rounded-lg border border-border bg-background p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <h2 id={titleId} className="text-lg font-medium">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
