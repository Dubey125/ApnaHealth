import { SEVERITY_LABELS, allergyStatus, orderedAllergies, type AllergyRecord } from "@/lib/records/allergies";
import { formatClinicDate } from "@/lib/format";

// The patient's own allergies, on their own record.
//
// Read-only, deliberately. A patient can see what has been recorded about
// them and correct it by telling their doctor, who records it — allergies
// are clinician-authored, and a self-reported entry arriving in a
// clinician's panel with the same weight as one they established would
// undermine the field exactly where it matters most.
//
// The three states are worded for a patient rather than a clinician, but
// the distinction is the same one that matters on the clinical side: "no
// known allergies" is a finding somebody made, and "not recorded" is not.
// A patient reading "none" when nobody ever asked them would be the same
// false confidence, pointed at the person least able to correct it.
//
// Nothing here interprets. No severity is inferred, nothing is called
// dangerous, and no advice is given about any substance.

export function AllergySummaryCard({
  allergies,
  reviewedAt,
}: {
  allergies: AllergyRecord[];
  reviewedAt: Date | null;
}) {
  const status = allergyStatus(allergies, reviewedAt);
  const active = orderedAllergies(allergies);

  return (
    <section
      className={`flex flex-col gap-2 rounded-2xl border p-5 ${
        status === "KNOWN" ? "border-danger/40 bg-danger/5" : "border-border bg-surface"
      }`}
    >
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Allergies</h3>

      {status === "NOT_ASKED" && (
        <p className="text-sm text-foreground">
          Nothing recorded yet.{" "}
          <span className="text-muted">
            If you react badly to any medicine or substance, tell your doctor at your next visit so it can be added.
          </span>
        </p>
      )}

      {status === "NONE_KNOWN" && (
        <p className="text-sm text-foreground">
          No known allergies
          {reviewedAt && <span className="text-muted"> · last checked {formatClinicDate(reviewedAt)}</span>}
        </p>
      )}

      {status === "KNOWN" && (
        <>
          <ul className="flex flex-col gap-1.5">
            {active.map((allergy) => (
              <li key={allergy.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-semibold text-foreground">{allergy.substance}</span>
                {allergy.severity !== "UNKNOWN" && (
                  <span className="text-xs text-muted">{SEVERITY_LABELS[allergy.severity]}</span>
                )}
                {allergy.reaction && <span className="text-xs text-muted">{allergy.reaction}</span>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            Mention these whenever you see a doctor, including at a clinic that does not use ApnaHealth.
          </p>
        </>
      )}
    </section>
  );
}
