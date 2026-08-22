import { requireStaffSession } from "@/lib/auth/staff";
import { buildClinicReport } from "@/lib/analytics/report";
import { parseReportRange } from "@/lib/analytics/range";
import { formatClinicDate, formatDurationMinutes, formatPercent } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";

interface AnalyticsPageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </Card>
  );
}

// Owner-only (ACCESS_MATRIX.md: "View analytics" is Owner ✅). Doctor's
// "limited" analytics is a smaller, doctor-scoped block on /app/doctor
// instead of this page — Front Desk's "limited" access has no page yet
// (front desk has no landing/nav route at all currently; see the Phase 9
// report).
export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const session = await requireStaffSession("OWNER");
  const { from, to } = await searchParams;
  const range = parseReportRange(from ?? null, to ?? null);
  const report = await buildClinicReport(session.clinicId, range);

  const fromValue = range.from.toISOString().slice(0, 10);
  const toValue = range.to.toISOString().slice(0, 10);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Analytics" />

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <Label htmlFor="analytics-from">
          From
          <Input id="analytics-from" type="date" name="from" defaultValue={fromValue} />
        </Label>
        <Label htmlFor="analytics-to">
          To
          <Input id="analytics-to" type="date" name="to" defaultValue={toValue} />
        </Label>
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Apply
        </button>
        <a
          href={`/app/analytics/export?from=${fromValue}&to=${toValue}`}
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Export CSV
        </a>
      </form>

      <p className="text-sm text-muted">
        {formatClinicDate(range.from)} – {formatClinicDate(range.to)} · {report.sampleSize} token
        {report.sampleSize === 1 ? "" : "s"}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Median wait" value={formatDurationMinutes(report.waitTime.medianSeconds)} sub={`n=${report.waitTime.sampleSize}`} />
        <Metric
          label="90th percentile wait"
          value={formatDurationMinutes(report.waitTime.p90Seconds)}
          sub={`n=${report.waitTime.sampleSize}`}
        />
        <Metric
          label="Median consultation duration"
          value={formatDurationMinutes(report.consultDuration.medianSeconds)}
          sub={`n=${report.consultDuration.sampleSize}`}
        />
        <Metric label="No-show rate" value={formatPercent(report.noShowRate)} />
        <Metric
          label="Prediction median error"
          value={formatDurationMinutes(report.prediction.medianAbsErrorSeconds)}
          sub={`n=${report.prediction.sampleSize}`}
        />
        <Metric
          label="Prediction window hit rate"
          value={formatPercent(report.prediction.windowHitRate)}
          sub={`n=${report.prediction.sampleSize}`}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Tokens by status</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(report.tokenCounts.byStatus).map(([status, count]) => (
              <TableRow key={status}>
                <TableCell className="text-foreground">{status.replace("_", " ")}</TableCell>
                <TableCell className="font-medium tabular-nums text-foreground">{count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
