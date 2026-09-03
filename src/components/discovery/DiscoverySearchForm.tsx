import { Input } from "@/components/ui/Input";
import type { Coordinates } from "@/lib/geo/distance";

// The name / speciality / place filter form, shared by /doctors, /clinics
// and /hospitals.
//
// It was written twice, once per page, and the two copies had already begun
// to differ — one had a `facility` hidden field the other didn't, and the
// location hidden-field block was duplicated verbatim. A form whose job is
// to preserve state is the worst possible place for two implementations.

export function DiscoverySearchForm({
  action,
  namePlaceholder,
  specialtyPlaceholder,
  nameValue,
  specialtyValue,
  cityValue,
  hasLocation,
  origin,
  near,
  radiusKm,
  hiddenFields,
}: {
  action: string;
  namePlaceholder: string;
  specialtyPlaceholder: string;
  nameValue?: string;
  specialtyValue?: string;
  cityValue?: string;
  /** True when a radius search is active, which replaces the city box. */
  hasLocation: boolean;
  origin: Coordinates | null;
  near: string | null;
  radiusKm: number;
  /** Extra filters to carry through submission, e.g. the doctors page's facility type. */
  hiddenFields?: Record<string, string>;
}) {
  return (
    <form
      method="GET"
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center"
    >
      <Input name="name" defaultValue={nameValue} placeholder={namePlaceholder} aria-label={namePlaceholder} className="sm:flex-1" />
      <Input
        name="specialty"
        defaultValue={specialtyValue}
        placeholder={specialtyPlaceholder}
        aria-label={specialtyPlaceholder}
        className="sm:flex-1"
      />

      {/* During a location search the city box is replaced by the panel
          above — it is the same question asked twice, and the location
          answer is the one being used. The location itself rides along as
          hidden fields so refining by name or speciality doesn't silently
          reset the radius search. */}
      {hasLocation ? (
        <>
          {origin && (
            <>
              <input type="hidden" name="lat" value={origin.latitude} />
              <input type="hidden" name="lng" value={origin.longitude} />
            </>
          )}
          {!origin && near && <input type="hidden" name="near" value={near} />}
          <input type="hidden" name="radiusKm" value={radiusKm} />
        </>
      ) : (
        <Input
          name="city"
          defaultValue={cityValue}
          placeholder="City or area"
          aria-label="City or area"
          className="sm:w-44"
        />
      )}

      {Object.entries(hiddenFields ?? {}).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}

      <button
        type="submit"
        className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        Search
      </button>
    </form>
  );
}
