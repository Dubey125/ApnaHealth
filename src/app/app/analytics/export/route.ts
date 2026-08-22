import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/staff";
import { buildAnonymizedRows } from "@/lib/analytics/report";
import { parseReportRange } from "@/lib/analytics/range";
import { toCsv } from "@/lib/analytics/csv";

// Owner-only anonymized research export (ACCESS_MATRIX.md; CLAUDE.md phase
// 10 spec: no patient name, phone, email or medical free text — see
// buildAnonymizedRows for exactly which columns that excludes).
export async function GET(request: Request) {
  const session = await requireStaffSession("OWNER");
  const url = new URL(request.url);
  const range = parseReportRange(url.searchParams.get("from"), url.searchParams.get("to"));

  const rows = await buildAnonymizedRows(session.clinicId, range);
  const csv = toCsv(rows);
  const filename = `apnahealth-research-export-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
