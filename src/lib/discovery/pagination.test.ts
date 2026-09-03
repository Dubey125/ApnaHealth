import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPageInfo, pageLinks, parsePage, splitAcrossGroups, PAGE_SIZE } from "./pagination";

test("parsePage falls back to page 1 for anything unusable", () => {
  assert.equal(parsePage("3"), 3);
  assert.equal(parsePage(undefined), 1);
  assert.equal(parsePage(""), 1);
  assert.equal(parsePage("0"), 1);
  assert.equal(parsePage("-4"), 1);
  assert.equal(parsePage("2.5"), 1);
  assert.equal(parsePage("abc"), 1);
});

test("buildPageInfo describes the window a page shows", () => {
  const info = buildPageInfo(2, 47, 12);
  assert.equal(info.page, 2);
  assert.equal(info.skip, 12);
  assert.equal(info.from, 13);
  assert.equal(info.to, 24);
  assert.equal(info.totalPages, 4);
  assert.equal(info.hasPrevious, true);
  assert.equal(info.hasNext, true);
});

test("the last page reports a short window, not a full one", () => {
  const info = buildPageInfo(4, 47, 12);
  assert.equal(info.from, 37);
  assert.equal(info.to, 47);
  assert.equal(info.hasNext, false);
});

// A stale bookmark or a hand-edited URL must not render "page 9 of 3".
test("a page past the end clamps to the last page", () => {
  const info = buildPageInfo(9, 47, 12);
  assert.equal(info.page, 4);
  assert.equal(info.hasNext, false);
});

test("an empty result set is page 1 of 1, showing nothing", () => {
  const info = buildPageInfo(1, 0, 12);
  assert.equal(info.page, 1);
  assert.equal(info.totalPages, 1);
  assert.equal(info.from, 0);
  assert.equal(info.to, 0);
  assert.equal(info.hasPrevious, false);
  assert.equal(info.hasNext, false);
});

test("pageLinks always includes the first and last page", () => {
  assert.deepEqual(pageLinks(1, 3), [1, 2, 3]);
  assert.deepEqual(pageLinks(7, 42, 2), [1, null, 5, 6, 7, 8, 9, null, 42]);
});

// An ellipsis standing in for exactly one page wastes more space than the
// number it hides.
test("pageLinks renders a single-page gap as the page itself", () => {
  assert.deepEqual(pageLinks(1, 5, 2), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageLinks(4, 6, 2), [1, 2, 3, 4, 5, 6]);
});

test("pageLinks handles a single page", () => {
  assert.deepEqual(pageLinks(1, 1), [1]);
});

// The window arithmetic behind verified-first ranking across pages.
test("splitAcrossGroups takes a whole page from the first group when it fits", () => {
  const { first, second } = splitAcrossGroups(0, 12, 30);
  assert.deepEqual(first, { skip: 0, take: 12 });
  assert.deepEqual(second, { skip: 0, take: 0 });
});

test("splitAcrossGroups straddles the boundary between the groups", () => {
  // 10 verified doctors; page 1 shows all 10 plus the first 2 unverified.
  const { first, second } = splitAcrossGroups(0, 12, 10);
  assert.deepEqual(first, { skip: 0, take: 10 });
  assert.deepEqual(second, { skip: 0, take: 2 });
});

test("splitAcrossGroups reads entirely from the second group once past the first", () => {
  // Page 2 of the same list: the verified group is exhausted, and the
  // second group must skip the 2 already shown on page 1, not 12.
  const { first, second } = splitAcrossGroups(12, 12, 10);
  assert.deepEqual(first, { skip: 10, take: 0 });
  assert.deepEqual(second, { skip: 2, take: 12 });
});

test("splitAcrossGroups copes with an empty first group", () => {
  const { first, second } = splitAcrossGroups(24, 12, 0);
  assert.deepEqual(first, { skip: 0, take: 0 });
  assert.deepEqual(second, { skip: 24, take: 12 });
});

test("the two windows always sum to the requested page size", () => {
  for (const firstTotal of [0, 1, 5, 12, 13, 40]) {
    for (const page of [1, 2, 3, 5]) {
      const skip = (page - 1) * PAGE_SIZE;
      const { first, second } = splitAcrossGroups(skip, PAGE_SIZE, firstTotal);
      assert.equal(first.take + second.take, PAGE_SIZE, `firstTotal=${firstTotal} page=${page}`);
    }
  }
});
