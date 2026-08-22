export interface ReportRange {
  from: Date;
  to: Date;
}

const DEFAULT_RANGE_DAYS = 30;

// `to` is exclusive (matches the report queries' `lt`), so a calendar
// date picked as "to" covers everything issued before the start of that
// day. Falls back to the last DEFAULT_RANGE_DAYS days whenever the input
// is missing, unparsable, or an inverted/empty range.
export function parseReportRange(fromParam: string | null, toParam: string | null, now: Date = new Date()): ReportRange {
  const fallback = (): ReportRange => ({ from: new Date(now.getTime() - DEFAULT_RANGE_DAYS * 86_400_000), to: now });

  if (!fromParam && !toParam) return fallback();

  const to = toParam ? new Date(`${toParam}T00:00:00.000Z`) : new Date(now);
  const from = fromParam
    ? new Date(`${fromParam}T00:00:00.000Z`)
    : new Date(to.getTime() - DEFAULT_RANGE_DAYS * 86_400_000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return fallback();
  }
  return { from, to };
}
