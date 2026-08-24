// Hardcoded to the platform default (Asia/Kolkata) rather than each
// clinic's own `timezone` field — fine while every seeded clinic uses the
// default; revisit if/when clinics in other timezones are onboarded.
const CLINIC_TIME_ZONE = "Asia/Kolkata";

export function formatClinicDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: CLINIC_TIME_ZONE, dateStyle: "medium" }).format(date);
}

// "Mon, 25 Aug 2026" — the weekday matters for a recurring clinic rota
// ("Dr. Sharma is here Tuesdays"), which a bare date hides.
export function formatClinicDateWithWeekday(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: CLINIC_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatClinicTime(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: CLINIC_TIME_ZONE, timeStyle: "short" }).format(date);
}

export function formatFeeMinor(minor: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(minor / 100);
}

export function formatDurationMinutes(seconds: number | null): string {
  if (seconds === null) return "—";
  return `${Math.round(seconds / 60)} min`;
}

export function formatPercent(fraction: number | null): string {
  if (fraction === null) return "—";
  return `${Math.round(fraction * 100)}%`;
}
