import type { Coordinates } from "./distance";

// Manual location search, without a geocoder.
//
// A patient who declines GPS still types "Koregaon Park" or "411001" and
// expects nearest-first results. Turning that text into a point normally
// means a paid, keyed geocoding API — a new external dependency and a new
// third party learning where our patients are looking, neither of which
// CLAUDE.md's locked stack allows without approval.
//
// So the coordinates come from the data we already hold: the listed
// facilities themselves. Every distinct locality, city and PIN code that
// has at least one geocoded facility becomes an ANCHOR at the centroid of
// those facilities. "Near Koregaon Park" then means "near where the
// Koregaon Park facilities actually are", which is the useful reading,
// and it degrades honestly — a place we have never listed simply has no
// anchor, and the caller falls back to plain text filtering.

export type AnchorKind = "POSTAL_CODE" | "AREA" | "CITY";

export interface AnchorSourceRow {
  areaLabel: string | null;
  city: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface LocationAnchor extends Coordinates {
  /** What the patient sees echoed back, e.g. "Koregaon Park, Pune". */
  label: string;
  kind: AnchorKind;
  facilityCount: number;
  /** Normalized keys this anchor answers to. */
  keys: string[];
}

// Fold case, drop punctuation and collapse whitespace so "Koregaon-Park",
// "koregaon  park" and "Koregaon Park" are one key. Diacritics are folded
// too: transliterated Indian place names are spelled inconsistently.
// Combining marks are dropped by code point rather than by a regex class:
// TypeScript's ES2017 target rules out \p{M}, and spelling the range out
// as a literal character class puts invisible characters in the source.
// Removing them here — rather than letting the [^a-z0-9] pass below turn
// them into spaces — keeps a mid-word accent from splitting a name in two.
const COMBINING_MARKS_START = 0x0300;
const COMBINING_MARKS_END = 0x036f;

export function normalizePlace(value: string): string {
  let folded = "";
  for (const character of value.normalize("NFD")) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint >= COMBINING_MARKS_START && codePoint <= COMBINING_MARKS_END) continue;
    folded += character;
  }
  return folded
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface Accumulator {
  kind: AnchorKind;
  label: string;
  keys: Set<string>;
  latitudeSum: number;
  longitudeSum: number;
  count: number;
}

function accumulate(
  buckets: Map<string, Accumulator>,
  kind: AnchorKind,
  label: string,
  extraKeys: string[],
  row: { latitude: number; longitude: number },
): void {
  const key = `${kind}:${normalizePlace(label)}`;
  const existing = buckets.get(key);
  if (existing) {
    existing.latitudeSum += row.latitude;
    existing.longitudeSum += row.longitude;
    existing.count += 1;
    for (const extra of extraKeys) existing.keys.add(extra);
    return;
  }
  buckets.set(key, {
    kind,
    label,
    keys: new Set([normalizePlace(label), ...extraKeys]),
    latitudeSum: row.latitude,
    longitudeSum: row.longitude,
    count: 1,
  });
}

/**
 * Build the anchor table from listed, geocoded facilities. Pure: the
 * caller does the query, so this is testable without a database.
 */
export function buildLocationAnchors(rows: readonly AnchorSourceRow[]): LocationAnchor[] {
  const buckets = new Map<string, Accumulator>();

  for (const row of rows) {
    if (row.latitude == null || row.longitude == null) continue;
    const point = { latitude: row.latitude, longitude: row.longitude };

    if (row.postalCode) {
      accumulate(buckets, "POSTAL_CODE", row.postalCode.trim(), [], point);
    }
    if (row.areaLabel) {
      // An area answers to its bare name and to "area, city", because
      // both are things people type, and because two cities can each
      // have a "Model Town".
      accumulate(buckets, "AREA", `${row.areaLabel.trim()}, ${row.city.trim()}`, [normalizePlace(row.areaLabel)], point);
    }
    accumulate(buckets, "CITY", row.city.trim(), [], point);
  }

  return [...buckets.values()]
    .map((bucket) => ({
      // Centroid. Adequate at city scale in India, where no locality
      // spans the antimeridian or a pole; this is an approximate search
      // origin, not a surveyed coordinate.
      latitude: bucket.latitudeSum / bucket.count,
      longitude: bucket.longitudeSum / bucket.count,
      label: bucket.label,
      kind: bucket.kind,
      facilityCount: bucket.count,
      keys: [...bucket.keys],
    }))
    .sort((a, b) => b.facilityCount - a.facilityCount || a.label.localeCompare(b.label));
}

// A PIN code is exact, a locality is more specific than the city that
// contains it, so ties resolve in that order before facility count.
const KIND_RANK: Record<AnchorKind, number> = { POSTAL_CODE: 0, AREA: 1, CITY: 2 };

function better(candidate: LocationAnchor, current: LocationAnchor | null): boolean {
  if (!current) return true;
  if (KIND_RANK[candidate.kind] !== KIND_RANK[current.kind]) {
    return KIND_RANK[candidate.kind] < KIND_RANK[current.kind];
  }
  return candidate.facilityCount > current.facilityCount;
}

/**
 * Resolve typed text to a search origin. Exact key matches win outright;
 * only if nothing matches exactly does it fall back to prefix and then
 * substring matching, so typing "Pune" never resolves to "Punewadi"
 * while "Koreg" still finds Koregaon Park.
 */
export function resolveLocationAnchor(query: string, anchors: readonly LocationAnchor[]): LocationAnchor | null {
  const normalized = normalizePlace(query);
  if (normalized.length === 0) return null;

  let exact: LocationAnchor | null = null;
  let prefix: LocationAnchor | null = null;
  let partial: LocationAnchor | null = null;

  for (const anchor of anchors) {
    for (const key of anchor.keys) {
      if (key === normalized) {
        if (better(anchor, exact)) exact = anchor;
      } else if (key.startsWith(normalized)) {
        if (better(anchor, prefix)) prefix = anchor;
      } else if (key.includes(normalized)) {
        if (better(anchor, partial)) partial = anchor;
      }
    }
  }

  return exact ?? prefix ?? partial;
}
