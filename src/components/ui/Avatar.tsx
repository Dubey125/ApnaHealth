import { cn } from "./cn";

function initials(name: string): string {
  const parts = name
    .replace(/^Dr\.?\s*/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// Plain <img>, not next/image: photoUrl is an arbitrary external URL (see
// Doctor.photoUrl), and next/image would need those hosts allowlisted in
// next.config.ts — a config change out of scope for a presentation pass.
// Falls back to an initials circle when there's no photo, never a stock
// placeholder image (CLAUDE.md: don't fabricate content that isn't real).
export function Avatar({ name, photoUrl, size = 48, className }: { name: string; photoUrl?: string | null; size?: number; className?: string }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        className={cn("rounded-full border border-border object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn("flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary", className)}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name) || "?"}
    </div>
  );
}
