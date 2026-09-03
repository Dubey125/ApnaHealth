import { requireStaffSession } from "@/lib/auth/staff";
import { buildClinicReport } from "@/lib/analytics/report";
import { parseReportRange } from "@/lib/analytics/range";
import { formatClinicDate, formatDurationMinutes, formatPercent } from "@/lib/format";
import { visitTypeLabel } from "@/lib/queue/visitTypes";
import type { VisitType } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table";
import { TokenStatusBadge } from "@/components/ui/StatusBadge";
import type { TokenStatus } from "@/generated/prisma/enums";

interface AnalyticsPageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

function Metric({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`p-4 flex flex-col justify-between ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      <div className="text-2xl font-bold tabular-nums text-foreground my-1">{value}</div>
      {sub && <div className="text-xs text-muted font-medium">{sub}</div>}
    </Card>
  );
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const session = await requireStaffSession("OWNER");
  const { from, to } = await searchParams;
  const range = parseReportRange(from ?? null, to ?? null);
  const report = await buildClinicReport(session.clinicId, range);

  const fromValue = range.from.toISOString().slice(0, 10);
  const toValue = range.to.toISOString().slice(0, 10);

  const totalTokens = report.sampleSize;

  return (
    <main className="mx-auto flex max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Clinic Queue &amp; Operational Analytics"
        action={
          <a
            href={`/app/analytics/export?from=${fromValue}&to=${toValue}`}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
          >
            Export CSV Report
          </a>
        }
      />

      {/* Date Range Selector */}
      <form
        method="GET"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm"
      >
        <Label htmlFor="analytics-from">
          From Date
          <Input id="analytics-from" type="date" name="from" defaultValue={fromValue} className="h-9 text-xs" />
        </Label>
        <Label htmlFor="analytics-to">
          To Date
          <Input id="analytics-to" type="date" name="to" defaultValue={toValue} className="h-9 text-xs" />
        </Label>
        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-xs font-semibold text-foreground transition-colors hover:bg-border/40"
        >
          Apply Filter
        </button>
        <span className="text-xs text-muted pb-2 sm:ml-auto">
          Viewing: {formatClinicDate(range.from)} – {formatClinicDate(range.to)} ({report.sampleSize} Total Tokens)
        </span>
      </form>

      {/* Key Metric Tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric
          label="Median Patient Wait"
          value={formatDurationMinutes(report.waitTime.medianSeconds)}
          sub={`Sample: ${report.waitTime.sampleSize} patients`}
          highlight
        />
        <Metric
          label="90th Percentile Wait"
          value={formatDurationMinutes(report.waitTime.p90Seconds)}
          sub="Peak rush wait time"
        />
        <Metric
          label="Median Consult Duration"
          value={formatDurationMinutes(report.consultDuration.medianSeconds)}
          sub={`Sample: ${report.consultDuration.sampleSize} consults`}
        />
        <Metric
          label="No-Show Rate"
          value={formatPercent(report.noShowRate)}
          sub="Tokens marked no-show"
        />
        <Metric
          label="ETA Window Hit Rate"
          value={formatPercent(report.prediction.windowHitRate)}
          sub="Predicted arrival accuracy"
          highlight
        />
        <Metric
          label="Median Prediction Error"
          value={formatDurationMinutes(report.prediction.medianAbsErrorSeconds)}
          sub="Deviation from actual start"
        />
      </div>

      {/* Consultation length by visit type — the evidence for whether
          separating visit types was worth doing at this clinic at all. If
          these medians are the same, baseline-v1 has nothing to offer
          here, and that is a finding worth showing rather than hiding. */}
      {report.consultDurationByType.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Consultation Length by Visit Type</h2>
            <span className="text-xs text-muted">Feeds the queue prediction</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Visit Type</TableHead>
                <TableHead>Median Duration</TableHead>
                <TableHead>Consultations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.consultDurationByType.map((row) => (
                <TableRow key={row.visitType}>
                  <TableCell className="text-foreground">{visitTypeLabel(row.visitType as VisitType)}</TableCell>
                  <TableCell className="font-bold tabular-nums text-foreground">
                    {formatDurationMinutes(row.medianSeconds)}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted">{row.sampleSize}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Accuracy by prediction model. Shown only once more than one
          model has produced predictions here, because a single row
          invites a comparison there is nothing to compare against. */}
      {report.predictionByModel.length > 1 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Prediction Accuracy by Model</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Window Hit Rate</TableHead>
                <TableHead>Median Error</TableHead>
                <TableHead>Predictions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.predictionByModel.map((row) => (
                <TableRow key={row.modelVersion}>
                  <TableCell className="text-foreground">{row.modelVersion}</TableCell>
                  <TableCell className="font-bold tabular-nums text-foreground">
                    {formatPercent(row.windowHitRate)}
                  </TableCell>
                  <TableCell className="tabular-nums text-foreground">
                    {formatDurationMinutes(row.medianAbsErrorSeconds)}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted">{row.sampleSize}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted">
            These models ran over different periods on different queues, so this is a record of what happened — not a
            controlled comparison. Read the sample sizes before drawing a conclusion from the rates.
          </p>
        </div>
      )}

      {/* Token Status Breakdown */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">OPD Token Volume &amp; Status Distribution</h2>
          <span className="text-xs text-muted">{totalTokens} Total Tokens</span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token Status</TableHead>
              <TableHead>Count</TableHead>
              <TableHead>Percentage of Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(report.tokenCounts.byStatus).map(([status, count]) => {
              const pct = totalTokens > 0 ? Math.round((count / totalTokens) * 100) : 0;
              return (
                <TableRow key={status}>
                  <TableCell>
                    <TokenStatusBadge status={status as TokenStatus} />
                  </TableCell>
                  <TableCell className="font-bold tabular-nums text-foreground">{count}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-32 rounded-full bg-border overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted tabular-nums">{pct}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
