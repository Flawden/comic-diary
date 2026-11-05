import assert from "node:assert/strict";
import test from "node:test";
import { chapterCountLabel, unreadChapterCount } from "./reading-updates-model";

const counts = { mainCount: 12, specialCount: 3, updatedCount: 2 };

test("visible unread count respects chapter-type filtering", () => {
  assert.equal(unreadChapterCount(counts, "ALL"), 15);
  assert.equal(unreadChapterCount(counts, "MAIN"), 12);
  assert.equal(unreadChapterCount(counts, "SPECIAL"), 3);
  assert.equal(unreadChapterCount(counts, "UPDATED"), 2);
});

test("Russian chapter labels handle 1, 2-4, 11-14 and 21", () => {
  assert.equal(chapterCountLabel(1), "1 глава");
  assert.equal(chapterCountLabel(2), "2 главы");
  assert.equal(chapterCountLabel(5), "5 глав");
  assert.equal(chapterCountLabel(11), "11 глав");
  assert.equal(chapterCountLabel(22), "22 главы");
  assert.equal(chapterCountLabel(104), "104 главы");
});
