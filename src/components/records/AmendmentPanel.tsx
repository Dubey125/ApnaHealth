"use client";

import { useActionState, useState } from "react";
import { amendConsultationRecord, type RecordActionState } from "@/app/app/queue/[sessionId]/token/[tokenId]/record/actions";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/components/ui/FormError";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { AMENDABLE_FIELDS, FIELD_LABELS, amendedFields, inOrder, type AmendmentRecord } from "@/lib/records/amendments";
import { formatClinicDate, formatClinicTime } from "@/lib/format";

const initialState: RecordActionState = {};

// Corrections to a consultation record.
//
// The original is never edited and never hidden. Amendments appear below
// it, in the order they were made, each carrying its own reason and
// timestamp — the screen equivalent of a dated, signed correction line on
// a paper chart.
//
// The form is deliberately empty rather than pre-filled with the current
// values. Pre-filling would invite a clinician to tweak a word and submit,
// producing an "amendment" that restates four fields when only one
// changed, and burying the actual correction. Leaving a field blank means
// "this one is unchanged", which is both the common case and the truthful
// one.

function AmendForm({
  sessionId,
  tokenId,
  recordId,
  onDone,
}: {
  sessionId: string;
  tokenId: string;
  recordId: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(amendConsultationRecord, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="tokenId" value={tokenId} />
      <input type="hidden" name="recordId" value={recordId} />

      <p className="text-sm text-muted">
        The original record is never changed. This is added alongside it, with your name and the time — both stay
        readable.
      </p>

      <Label htmlFor="amend-reason">
        Why is this being amended?
        <Input
          id="amend-reason"
          name="reason"
          required
          minLength={5}
          maxLength={500}
          autoFocus
          placeholder="e.g. Diagnosis entered against the wrong condition"
        />
      </Label>

      <p className="text-xs text-muted">Fill in only what changes. Leave the rest blank.</p>

      {AMENDABLE_FIELDS.map((field) => (
        <Label key={field} htmlFor={`amend-${field}`}>
          {FIELD_LABELS[field]}
          <Textarea id={`amend-${field}`} name={field} rows={2} maxLength={5000} placeholder="Unchanged" />
        </Label>
      ))}

      <Label htmlFor="amend-note">
        Note
        <Textarea
          id="amend-note"
          name="note"
          rows={2}
          maxLength={5000}
          placeholder="e.g. Amoxicillin dose should read 1-0-1. Patient telephoned and informed."
        />
        <span className="text-xs text-muted">
          For anything the fields above cannot carry — a prescription already handed over cannot be un-issued, so say
          here what it should have read.
        </span>
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
          {pending ? "Saving…" : "Add amendment"}
        </button>
      </div>
    </form>
  );
}

export function AmendmentPanel({
  sessionId,
  tokenId,
  recordId,
  amendments,
  canAmend,
}: {
  sessionId: string;
  tokenId: string;
  recordId: string;
  amendments: (AmendmentRecord & { doctor: { name: string } })[];
  /** Only the record's author. An owner or another doctor sees, but cannot add. */
  canAmend: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ordered = inOrder(amendments) as (AmendmentRecord & { doctor: { name: string } })[];

  if (ordered.length === 0 && !canAmend) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
          {ordered.length > 0 ? `Amendments (${ordered.length})` : "Amendments"}
        </h3>
        {canAmend && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-border/40"
          >
            Amend this record
          </button>
        )}
      </div>

      {ordered.map((amendment, index) => (
        <article key={amendment.id} className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-warning">Amendment {index + 1}</span>
            <span className="text-[11px] text-muted">
              {amendment.doctor.name} · {formatClinicDate(amendment.amendedAt)} {formatClinicTime(amendment.amendedAt)}
            </span>
          </div>

          <p className="text-xs text-muted">
            <span className="font-medium text-foreground">Reason:</span> {amendment.reason}
          </p>

          {amendedFields(amendment).map((field) => (
            <div key={field.field} className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{field.label}</span>
              <span className="whitespace-pre-wrap text-sm text-foreground">{field.value}</span>
            </div>
          ))}

          {amendment.note && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Note</span>
              <span className="whitespace-pre-wrap text-sm text-foreground">{amendment.note}</span>
            </div>
          )}
        </article>
      ))}

      <Dialog open={open} onClose={() => setOpen(false)} title="Amend this record">
        <AmendForm sessionId={sessionId} tokenId={tokenId} recordId={recordId} onDone={() => setOpen(false)} />
      </Dialog>
    </section>
  );
}
