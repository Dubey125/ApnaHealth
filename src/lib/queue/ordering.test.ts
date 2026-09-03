import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NORMAL_PRIORITY,
  compareQueueOrder,
  countAhead,
  isPrioritised,
  orderQueue,
  priorityToMoveToFront,
  servedBeforeWhere,
} from "./ordering";

const token = (tokenNumber: number, queuePriority = NORMAL_PRIORITY) => ({ tokenNumber, queuePriority });

test("with nobody prioritised, order is exactly token order", () => {
  // The property that makes the migration safe to apply to a running
  // session: default priority reproduces the pre-existing behaviour.
  const queue = [token(3), token(1), token(2)];
  assert.deepEqual(
    orderQueue(queue).map((t) => t.tokenNumber),
    [1, 2, 3],
  );
});

test("a prioritised token is served before lower numbers that were ahead of it", () => {
  const queue = [token(1), token(2), token(7, 1)];
  assert.deepEqual(
    orderQueue(queue).map((t) => t.tokenNumber),
    [7, 1, 2],
  );
});

test("prioritising a second patient puts them ahead of the first", () => {
  // "See this one next", said twice, means the second one next — the most
  // recent decision wins rather than being silently ignored.
  const queue = [token(1), token(9, 1)];
  const next = priorityToMoveToFront(queue);
  const after = orderQueue([...queue, token(4, next)]);
  assert.deepEqual(
    after.map((t) => t.tokenNumber),
    [4, 9, 1],
  );
});

test("priorityToMoveToFront never returns a normal priority, even for an empty queue", () => {
  assert.ok(priorityToMoveToFront([]) > NORMAL_PRIORITY);
  assert.ok(priorityToMoveToFront([token(1)]) > NORMAL_PRIORITY);
});

test("countAhead does not count a prioritised patient as already past", () => {
  // The bug this exists for. #7 is moved to the front; #8 is still
  // waiting. Counting by token number alone, #8 sees "#7 has a lower
  // number, they must be done" and under-estimates their own wait.
  const me = token(8);
  const others = [token(7, 1), token(9)];
  assert.equal(countAhead(me, others), 1, "the prioritised #7 is ahead of #8, not behind");
});

test("countAhead counts everyone genuinely in front and nobody behind", () => {
  const me = token(5);
  const others = [token(1), token(2), token(6), token(7), token(9, 2)];
  assert.equal(countAhead(me, others), 3, "#1, #2 and the prioritised #9");
});

test("a token is not ahead of itself", () => {
  const me = token(4, 2);
  assert.equal(countAhead(me, [me]), 0);
  assert.equal(compareQueueOrder(me, me), 0);
});

test("servedBeforeWhere expresses the same rule as the comparator", () => {
  // The Prisma filter and the in-memory comparator are two encodings of
  // one rule, and they are used on the same screens — so drift between
  // them would show a patient one position and predict from another.
  const me = token(5, 1);
  const where = servedBeforeWhere(me);
  const clauses = where.OR as { queuePriority?: unknown; tokenNumber?: unknown }[];

  const matches = (candidate: { tokenNumber: number; queuePriority: number }) => {
    const [higherPriority, samePriorityLowerNumber] = clauses;
    const gt = (higherPriority.queuePriority as { gt: number }).gt;
    const lt = (samePriorityLowerNumber.tokenNumber as { lt: number }).lt;
    return (
      candidate.queuePriority > gt ||
      (candidate.queuePriority === samePriorityLowerNumber.queuePriority && candidate.tokenNumber < lt)
    );
  };

  const candidates = [token(1), token(9), token(4, 1), token(6, 1), token(2, 5), token(3, 0)];
  for (const candidate of candidates) {
    assert.equal(
      matches(candidate),
      compareQueueOrder(candidate, me) < 0,
      `filter and comparator disagree about #${candidate.tokenNumber} at priority ${candidate.queuePriority}`,
    );
  }
});

test("isPrioritised distinguishes a moved token from a normal one", () => {
  assert.equal(isPrioritised(token(1)), false);
  assert.equal(isPrioritised(token(1, 1)), true);
});
