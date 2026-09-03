"use client";

import { useActionState, useState } from "react";
import { correctVisitType, type RecordActionState } from "./actions";
import { Select } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import type { VisitType } from "@/generated/prisma/enums";
import { STAFF_VISIT_TYPES, visitTypeLabel } from "@/lib/queue/visitTypes";

const initialState: RecordActionState = {};

// The doctor correcting what kind of visit this actually was.
//
// Deliberately small and quiet. This is not a clinical field and it must
// not compete for attention with the consultation record — the doctor's
// job on this screen is the patient in front of them. It saves on change
// with no separate confirm step, because the cost of a wrong click here is
// one more click, and every extra step is a reason not to bother.
//
// It matters anyway: the visit type is what every future prediction reads
// to work out how long this doctor's appointments take. A procedure filed
// as a follow-up makes every later follow-up patient's estimate worse.
export function VisitTypeCorrection({
  sessionId,
  tokenId,
  visitType,
}: {
  sessionId: string;
  tokenId: string;
  visitType: VisitType;
}) {
  const [state, formAction, pending] = useActionState(correctVisitType, initialState);
  const [value, setValue] = useState<string>(visitType);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="tokenId" value={tokenId} />
      <div className="flex items-center gap-2">
        <label htmlFor="visit-type-correction" className="text-xs text-muted">
          Visit type
        </label>
        <Select
          id="visit-type-correction"
          name="visitType"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-8 w-auto py-0 text-xs"
        >
          <option value="UNSPECIFIED">{visitTypeLabel("UNSPECIFIED")}</option>
          {STAFF_VISIT_TYPES.map((type) => (
            <option key={type} value={type}>
              {visitTypeLabel(type)}
            </option>
          ))}
        </Select>
        {value !== visitType && (
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Saving..." : "Save"}
          </button>
        )}
      </div>
      <FormError>{state.error}</FormError>
    </form>
  );
}
