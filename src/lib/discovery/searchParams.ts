export type RawSearchParams = Record<string, string | string[] | undefined>;

// The query-string plumbing shared by every discovery route.
//
// These three helpers were copied into /doctors and into the facility
// discovery component, which is exactly how two pages that are supposed to
// behave identically stop doing so: a fix to one copy is invisible to the
// other. They live here now, and both call sites import them.

/**
 * A repeated parameter (`?city=Pune&city=Mumbai`) is a hand-edited or
 * malformed URL, not a feature — the first value wins rather than the page
 * erroring or silently ANDing two cities together.
 */
export function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Treats a blank or whitespace-only parameter as absent, not as a filter matching everything. */
export function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function readParam(params: RawSearchParams, key: string): string | undefined {
  return emptyToUndefined(firstValue(params[key]));
}

/**
 * A chip link that toggles ONE parameter and preserves the rest.
 *
 * Rebuilding the whole query string rather than replacing it is what lets a
 * patient narrow by speciality without losing the location they just
 * shared — the previous behaviour reset the page to a bare filter.
 *
 * `page` is the one parameter that never survives a change to another one:
 * narrowing to Cardiology while on page 4 of everything should land on page
 * 1 of cardiologists, not page 4 of a list that may only have one page.
 */
export function buildChipHref(
  basePath: string,
  params: RawSearchParams,
  key: string,
  value: string | null,
): string {
  const search = new URLSearchParams();
  for (const [param, raw] of Object.entries(params)) {
    const single = firstValue(raw);
    if (!single || param === key) continue;
    if (param === "page" && key !== "page") continue;
    search.set(param, single);
  }
  if (value) search.set(key, value);
  const query = search.toString();
  return query.length > 0 ? `${basePath}?${query}` : basePath;
}

/** Same URL minus the given parameters — how "clear location" is built. */
export function buildHrefWithout(basePath: string, params: RawSearchParams, keys: string[]): string {
  const drop = new Set(keys);
  const search = new URLSearchParams();
  for (const [param, raw] of Object.entries(params)) {
    const single = firstValue(raw);
    if (single && !drop.has(param)) search.set(param, single);
  }
  const query = search.toString();
  return query.length > 0 ? `${basePath}?${query}` : basePath;
}

/** The parameters that together make up an active location search. */
export const LOCATION_PARAMS = ["lat", "lng", "near", "radiusKm", "radius"] as const;
