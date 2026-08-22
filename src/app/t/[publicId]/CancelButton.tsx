"use client";

import { useActionState } from "react";
import { cancelToken, type CancelState } from "./actions";
import { FormError } from "@/components/ui/FormError";

const initialState: CancelState = {};

export function CancelButton({ publicId }: { publicId: string }) {
  const [state, formAction, pending] = useActionState(cancelToken, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="publicId" value={publicId} />
      <FormError>{state.error}</FormError>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center rounded-md border border-danger/40 px-4 text-sm font-medium text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Cancelling..." : "Cancel my token"}
      </button>
    </form>
  );
}
