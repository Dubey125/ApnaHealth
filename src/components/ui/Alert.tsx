import type { ReactNode } from "react";
import { cn } from "./cn";

export type AlertVariant = "success" | "warning" | "danger" | "info";

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  info: "border-info/30 bg-info/10 text-info",
};

// Page-level banner — the Alert to FormError's field-level message. Danger
// uses role="alert" (assertive, interrupts screen readers); the others use
// role="status" (polite).
export function Alert({
  variant = "info",
  children,
  className,
}: {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role={variant === "danger" ? "alert" : "status"} className={cn("rounded-md border px-4 py-3 text-sm", VARIANT_CLASSES[variant], className)}>
      {children}
    </div>
  );
}
