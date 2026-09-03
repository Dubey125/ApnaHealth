import { buildChipHref, type RawSearchParams } from "./searchParams";

// Offset pagination for the discovery lists.
//
// Page numbers rather than cursors: a directory's pages are shareable and
// crawlable, "page 3 of cardiologists in Pune" is a URL someone can be
// given, and the result sets are small enough that a large OFFSET is not
// the problem it becomes at millions of rows. Revisit if it ever is.

export const PAGE_SIZE = 12;

/** How many numbered links flank the current page before it elides. */
export const PAGE_LINK_WINDOW = 2;

/**
 * A page number from a query parameter. Anything unparseable, zero,
 * negative or fractional resolves to page 1 rather than erroring — a
 * hand-edited or stale URL should still render the directory.
 */
export function parsePage(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** 1-based index of the first row shown, for "showing 13–24 of 47". */
  from: number;
  /** 1-based index of the last row shown. */
  to: number;
  hasPrevious: boolean;
  hasNext: boolean;
  skip: number;
}

export function buildPageInfo(requestedPage: number, total: number, pageSize: number = PAGE_SIZE): PageInfo {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // A page past the end clamps to the last one instead of rendering an
  // empty list that claims to be "page 9 of 3".
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const skip = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    total,
    totalPages,
    from: total === 0 ? 0 : skip + 1,
    to: Math.min(skip + pageSize, total),
    hasPrevious: page > 1,
    hasNext: page < totalPages,
    skip,
  };
}

/** Page 1 drops the parameter entirely, so the canonical URL has no `?page=1`. */
export function buildPageHref(basePath: string, params: RawSearchParams, page: number): string {
  return buildChipHref(basePath, params, "page", page <= 1 ? null : String(page));
}

/**
 * The page numbers to render: always the first and last, plus a window
 * around the current page, with nulls marking elisions.
 *
 *   1 … 5 6 [7] 8 9 … 42
 */
export function pageLinks(page: number, totalPages: number, window: number = PAGE_LINK_WINDOW): (number | null)[] {
  const wanted = new Set<number>([1, totalPages]);
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = page + offset;
    if (candidate >= 1 && candidate <= totalPages) wanted.add(candidate);
  }

  const sorted = [...wanted].sort((a, b) => a - b);
  const withGaps: (number | null)[] = [];
  let previous = 0;
  for (const value of sorted) {
    // A gap of exactly one page is rendered as that page rather than as an
    // ellipsis hiding a single number.
    if (value - previous === 2) withGaps.push(previous + 1);
    else if (value - previous > 2) withGaps.push(null);
    withGaps.push(value);
    previous = value;
  }
  return withGaps;
}

export interface GroupWindow {
  skip: number;
  take: number;
}

/**
 * Split one page's window across two ordered groups.
 *
 * Doctor discovery ranks verified doctors ahead of everyone else, then
 * alphabetically. That ranking used to be done in JavaScript after loading
 * every matching row — which pagination makes impossible, since page 2
 * cannot be sorted against rows page 1 never fetched.
 *
 * Postgres cannot do it in one ORDER BY either: it sorts an enum by its
 * declaration order (PENDING, VERIFIED, REJECTED), which would rank
 * unverified doctors first — the original reason the sort was in JS.
 *
 * So the list is two ordered queries, concatenated, and this works out how
 * much of the requested window falls in each. Pure, so the arithmetic is
 * testable without a database.
 */
export function splitAcrossGroups(
  skip: number,
  take: number,
  firstGroupTotal: number,
): { first: GroupWindow; second: GroupWindow } {
  const firstSkip = Math.min(skip, firstGroupTotal);
  const firstTake = Math.max(0, Math.min(take, firstGroupTotal - firstSkip));
  const secondSkip = Math.max(0, skip - firstGroupTotal);
  const secondTake = take - firstTake;
  return {
    first: { skip: firstSkip, take: firstTake },
    second: { skip: secondSkip, take: Math.max(0, secondTake) },
  };
}
