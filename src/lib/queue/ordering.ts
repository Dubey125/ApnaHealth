import type { Prisma } from "@/generated/prisma/client";

// The one definition of "what order is this queue in".
//
// Before reordering existed, queue order WAS token number, and seven call
// sites independently encoded that as `orderBy: { tokenNumber: "asc" }` or
// `where: { tokenNumber: { lt: mine } }`. Three of those seven are what a
// patient is shown — their position on the ticket page, their position on
// the appointments page, and the input to the prediction engine — so a
// reordering feature that updated the console but not those would not be a
// cosmetic inconsistency: it would quietly tell a patient the wrong place
// in the queue and the wrong time to expect to be seen.
//
// So order is defined once, here, and imported. If the rule ever changes
// again, it changes in one file.

/** Normal FIFO. A token at this priority is served in token-number order. */
export const NORMAL_PRIORITY = 0;

/**
 * Queue order: prioritised tokens first (highest first), then by token
 * number.
 *
 * Token number remains the tiebreaker, so with nobody prioritised this is
 * exactly the old behaviour — which is what makes the migration safe to
 * apply to a session that is already running.
 */
export const QUEUE_ORDER_BY: Prisma.TokenOrderByWithRelationInput[] = [
  { queuePriority: "desc" },
  { tokenNumber: "asc" },
];

export interface OrderedToken {
  queuePriority: number;
  tokenNumber: number;
}

/** The same ordering as QUEUE_ORDER_BY, for a list already in memory. */
export function compareQueueOrder(a: OrderedToken, b: OrderedToken): number {
  return b.queuePriority - a.queuePriority || a.tokenNumber - b.tokenNumber;
}

export function orderQueue<T extends OrderedToken>(tokens: T[]): T[] {
  return [...tokens].sort(compareQueueOrder);
}

/**
 * A Prisma filter matching the tokens served before `token`.
 *
 * Replaces the `tokenNumber: { lt: mine }` predicate that three call sites
 * used to count "people ahead of me". That predicate is wrong the moment
 * anyone is prioritised: a patient moved to the front keeps their high
 * token number, so everyone behind them would go on counting them as
 * already past and under-estimate their own wait by a whole consultation.
 *
 * Expressed as the lexicographic comparison it is — a higher priority, or
 * the same priority and a lower number — so the count still happens in the
 * database rather than by loading the queue.
 */
export function servedBeforeWhere(token: OrderedToken): Prisma.TokenWhereInput {
  return {
    OR: [
      { queuePriority: { gt: token.queuePriority } },
      { queuePriority: token.queuePriority, tokenNumber: { lt: token.tokenNumber } },
    ],
  };
}

/** In-memory equivalent of servedBeforeWhere, for an already-loaded queue. */
export function countAhead(target: OrderedToken, others: OrderedToken[]): number {
  return others.filter((other) => compareQueueOrder(other, target) < 0).length;
}

/**
 * The priority that puts a token at the front of `queue`.
 *
 * One above the current maximum, so the most recent decision wins — if the
 * front desk prioritises a second patient, that patient goes ahead of the
 * first, which is what "see this one next" means when someone says it
 * twice. Values only ever climb; an Int is ample for one session, and
 * priorities never carry across sessions.
 */
export function priorityToMoveToFront(queue: OrderedToken[]): number {
  return Math.max(NORMAL_PRIORITY, ...queue.map((token) => token.queuePriority)) + 1;
}

/** Whether a token has been moved out of its natural position. */
export function isPrioritised(token: OrderedToken): boolean {
  return token.queuePriority > NORMAL_PRIORITY;
}
