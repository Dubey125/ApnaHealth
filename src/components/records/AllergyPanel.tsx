"use client";

import { useActionState, useState } from "react";
import {
  recordPatientAllergy,
  confirmNoKnownAllergies,
  retractPatientAllergy,
  type RecordActionState,
} from "@/app/app/queue/[sessionId]/token/[tokenId]/record/actions";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/components/ui/FormError";
import { Input, Label, Select } from "@/components/ui/Input";
import { ALLERGY_SEVERITIES, SEVERITY_LABELS, allergyStatus, orderedAllergies, type AllergyRecord } from "@/lib/records/allergies";
import { formatClinicDate } from "@/lib/format";

const initialState: RecordActionState = {};

// What this patient reacts to, put in front of the person prescribing.
//
// Three states, and the panel says which one out loud:
//
//   NOT ASKED    nobody has established anything. Shown as a prompt, not
//                as reassurance — a blank panel read as "cleared" is the
//                exact failure this feature exists to prevent.
//   NONE KNOWN   a clinician asked and found nothing. A real finding, and
//                it carries the date it was made.
//   KNOWN        the list, most serious first.
//
// It does NOT check anything against the prescription. No interaction
// warnings, no contraindication alerts, no matching a drug name to a
// recorded substance. That is clinical decision support and CLAUDE.md puts
// clinical decisions with the clinician. This shows the record; the doctor
// reads it.

function SeverityTag({ severity }: { severity: AllergyRecord["severity"] }) {
  // Styled by the severity the CLINICIAN recorded — presenting their own
  // note back to them, not an opinion formed here.
  const tone =
    severity === "SEVERE"
      ? "border-danger/40 bg-danger/10 text-danger"
      : severity === "MODERATE"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-border bg-surface text-muted";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

function RecordAllergyForm({ sessionId, tokenId, onDone }: { sessionId: string; tokenId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(recordPatientAllergy, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="tokenId" value={tokenId} />
      <Label htmlFor="allergy-substance">
        Substance
        <Input id="allergy-substance" name="substance" required minLength={2} maxLength={120} autoFocus placeholder="e.g. Penicillin" />
      </Label>
      <Label htmlFor="allergy-reaction">
        Reaction (optional)
        <Input id="allergy-reaction" name="reaction" maxLength={200} placeholder="e.g. Rash and swelling" />
      </Label>
      <Label htmlFor="allergy-severity">
        Severity
        <Select id="allergy-severity" name="severity" defaultValue="UNKNOWN">
          {ALLERGY_SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {SEVERITY_LABELS[severity]}
            </option>
          ))}
        </Select>
      </Label>
      <FormError>{state.error}</FormError>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-border/40"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : "Record allergy"}
        </button>
      </div>
    </form>
  );
}

function ConfirmNoneButton({ sessionId, tokenId }: { sessionId: string; tokenId: string }) {
  const [state, formAction, pending] = useActionState(confirmNoKnownAllergies, initialState);
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="tokenId" value={tokenId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-border/40 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Asked — none known"}
      </button>
      <FormError>{state.error}</FormError>
    </form>
  );
}

function RetractButton({ sessionId, tokenId, allergy }: { sessionId: string; tokenId: string; allergy: AllergyRecord }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(retractPatientAllergy, initialState);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted underline underline-offset-2 hover:text-foreground"
      >
        Withdraw
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Withdraw ${allergy.substance}?`}>
        <p className="text-sm text-muted">
          This is not deleted. It stays in the record as withdrawn, with your reason — the next clinician needs to be
          able to tell that it was once recorded.
        </p>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="tokenId" value={tokenId} />
          <input type="hidden" name="allergyId" value={allergy.id} />
          <Label htmlFor={`retract-${allergy.id}`}>
            Reason
            <Input id={`retract-${allergy.id}`} name="reason" required minLength={3} maxLength={200} placeholder="e.g. Patient reports it was a viral rash, not the drug" />
          </Label>
          <FormError>{state.error}</FormError>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-border/40"
            >
              Keep it
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-danger px-3 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-50"
            >
              {pending ? "Working…" : "Withdraw"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function AllergyPanel({
  sessionId,
  tokenId,
  allergies,
  reviewedAt,
}: {
  sessionId: string;
  tokenId: string;
  allergies: AllergyRecord[];
  reviewedAt: Date | null;
}) {
  const [adding, setAdding] = useState(false);
  const status = allergyStatus(allergies, reviewedAt);
  const active = orderedAllergies(allergies);

  const tone =
    status === "KNOWN"
      ? "border-danger/40 bg-danger/5"
      : status === "NOT_ASKED"
        ? "border-warning/40 bg-warning/5"
        : "border-border bg-background";

  return (
    <section className={`flex flex-col gap-3 rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Allergies</h3>
        <div className="flex items-center gap-2">
            {status !== "KNOWN" && <ConfirmNoneButton sessionId={sessionId} tokenId={tokenId} />}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-border/40"
          >
            Add allergy
          </button>
        </div>
      </div>

      {status === "NOT_ASKED" && (
        // Worded as an open question, never as reassurance. "No allergies"
        // here would be an assertion nobody has made.
        <p className="text-sm font-medium text-warning">Not recorded — ask the patient before prescribing.</p>
      )}

      {status === "NONE_KNOWN" && (
        <p className="text-sm text-foreground">
          No known allergies
          {reviewedAt && <span className="text-muted"> · asked {formatClinicDate(reviewedAt)}</span>}
        </p>
      )}

      {status === "KNOWN" && (
        <ul className="flex flex-col gap-2">
          {active.map((allergy) => (
            <li key={allergy.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{allergy.substance}</span>
                <SeverityTag severity={allergy.severity} />
                {allergy.reaction && <span className="text-xs text-muted">{allergy.reaction}</span>}
              </span>
              <RetractButton sessionId={sessionId} tokenId={tokenId} allergy={allergy} />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title="Record an allergy">
        <RecordAllergyForm sessionId={sessionId} tokenId={tokenId} onDone={() => setAdding(false)} />
      </Dialog>
    </section>
  );
}
