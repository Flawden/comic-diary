import assert from "node:assert/strict";
import test from "node:test";
import { unreadEarlierMainChapters, selectReadThrough, type ReadingChapter } from "./chapter-reading-model";

const row = (id: number, sortOrder: number, kind = "MAIN", status = "RELEASED"): ReadingChapter =>
  ({ id, sortOrder, kind, status, displayCode: String(id), title: null, supersedesChapterId: null });

test("smart prompt excludes existing reads, specials, scheduled, archive and later chapters", () => {
  const registry = [row(5, 5), row(3, 3, "MAIN", "SCHEDULED"), row(1, 1), row(7, 7), row(2, 2), row(4, 4, "SPECIAL"), row(6, 6, "MAIN", "ARCHIVED")];
  assert.deepEqual(unreadEarlierMainChapters(registry, [1, 5], 7).map((x) => x.id), [2]);
  assert.deepEqual(unreadEarlierMainChapters(registry, [], 3), []);
  assert.deepEqual(unreadEarlierMainChapters(registry, [], 4), []);
  assert.deepEqual(unreadEarlierMainChapters(registry, [], 999), []);
  assert.deepEqual(selectReadThrough(registry, 7).map((x) => x.id), [1, 2, 5, 7]);
});

test("registry order, not chapter code or volume, determines earlier chapters", () => {
  const registry = [row(21, 10), row(11, 1), row(17, 5)];
  assert.deepEqual(unreadEarlierMainChapters(registry, [11], 21).map((x) => x.id), [17]);
  assert.deepEqual(unreadEarlierMainChapters(registry, [11, 17], 21), []);
});
