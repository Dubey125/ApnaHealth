"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

type ToastVariant = "success" | "danger" | "info";
interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}
interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Not wired into any page's server actions yet — this is the primitive
// only (PHASE-12 scope). Later phases attach it to specific mutations
// (e.g. "Break added", "Token checked in") as they redesign each area.
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: "border-success/30 text-success",
  danger: "border-danger/30 text-danger",
  info: "border-border text-foreground",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, variant }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn("pointer-events-auto rounded-md border bg-surface px-4 py-2 text-sm shadow-sm", VARIANT_CLASSES[toast.variant])}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
