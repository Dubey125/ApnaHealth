import { displayVitals, vitalsTrend, type Vitals, type VitalsTrendPoint } from "@/lib/records/vitals";
import { formatClinicDate } from "@/lib/format";

// Vitals for this visit, and the same measurements from previous ones.
//
// This is the whole point of storing them as numbers. Before, a blood
// pressure was a fragment of a sentence inside the assessment text, so a
// doctor could read one visit but never compare four.
//
// It presents readings and nothing else. No arrows, no colour by severity,
// no "up since last time", no reference ranges. Interpreting a vital sign
// is a clinical decision and CLAUDE.md puts those with the clinician —
// the software's job is to remember the numbers accurately and lay them
// out where they can be seen together.

export function VitalsPanel({
  current,
  history,
}: {
  current: Vitals;
  /** Earlier visits, already scoped to this doctor and patient by the caller. */
  history: VitalsTrendPoint[];
}) {
  const rows = displayVitals(current);
  const trend = vitalsTrend([...history, { consultedAt: new Date(), vitals: current }]);

  if (rows.length === 0 && trend.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Vitals</h3>

      {rows.length > 0 ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {rows.map((row) => (
            <div key={row.key} className="flex flex-col">
              <dt className="text-[11px] font-medium text-muted">{row.label}</dt>
              <dd className="text-sm font-semibold tabular-nums text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-muted">No vitals recorded at this visit.</p>
      )}

      {trend.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <h4 className="text-[11px] font-medium text-muted">
            Previously recorded — oldest first, from this patient&apos;s visits with you
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <tbody className="divide-y divide-border">
                {trend.map((series) => (
                  <tr key={series.key}>
                    <th scope="row" className="py-1.5 pr-4 font-medium text-muted whitespace-nowrap">
                      {series.label}
                    </th>
                    {series.points.map((point) => (
                      <td key={point.consultedAt.toISOString()} className="py-1.5 pr-4 whitespace-nowrap">
                        <span className="font-semibold tabular-nums text-foreground">{point.value}</span>
                        <span className="block text-[10px] text-muted">{formatClinicDate(point.consultedAt)}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
