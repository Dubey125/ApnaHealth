"use client";

export function PrintPrescriptionButton() {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") {
          window.print();
        }
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-4 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors shadow-sm no-print"
    >
      <span>🖨️ Print Prescription (PDF)</span>
    </button>
  );
}
