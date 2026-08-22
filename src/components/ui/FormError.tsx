import type { ReactNode } from "react";

// The {state.error && <p className="text-sm text-red-600">...</p>} pattern
// that was duplicated verbatim across ~14 client components.
export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  );
}
