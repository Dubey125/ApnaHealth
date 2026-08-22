const IST_OFFSET_MINUTES = 5 * 60 + 30;

// "Today" boundaries in Asia/Kolkata, expressed as UTC instants — same
// hardcoded-IST convention used elsewhere (format.ts's CLINIC_TIME_ZONE,
// seed.ts's todayAtIST) until per-clinic timezones are supported.
// Deliberately instant-based rather than comparing calendar dates: a plain
// UTC-midnight comparison already caused a real bug on the doctor profile
// page (a same-day IST session got excluded because its date-only
// timestamp landed before UTC midnight).
export function clinicDayBounds(now: Date): { start: Date; end: Date } {
  const istNow = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  const istMidnightMs = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  const start = new Date(istMidnightMs - IST_OFFSET_MINUTES * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60_000);
  return { start, end };
}
