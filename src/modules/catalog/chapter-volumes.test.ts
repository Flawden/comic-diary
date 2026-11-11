import assert from "node:assert/strict";
import test from "node:test";
import { groupChaptersByVolume, volumeHeading, volumeProgress } from "./chapter-volumes";

const chapter = (id: number, volumeNumber: number | null, status = "RELEASED") => ({ id, volumeNumber, status });

test("chapters without volumes remain an ungrouped list", () => {
  const groups = groupChaptersByVolume([chapter(1, null), chapter(2, null)]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].number, null);
  assert.deepEqual(groups[0].chapters.map(item => item.id), [1, 2]);
});

test("volumes sort numerically, keep chapter order and retain the ungrouped section", () => {
  const groups = groupChaptersByVolume([chapter(7, 2), chapter(2, 1), chapter(9, null), chapter(1, 1), chapter(8, 2)]);
  assert.deepEqual(groups.map(group => group.number), [1, 2, null]);
  assert.deepEqual(groups.map(group => group.chapters.map(item => item.id)), [[2, 1], [7, 8], [9]]);
});

test("scheduled chapters are not counted or marked as read in volume progress", () => {
  const rows = [chapter(1, 1), chapter(2, 1), chapter(3, 1, "SCHEDULED")];
  assert.deepEqual(volumeProgress(rows, new Set([1, 3])), { read: 1, total: 2 });
});

test("optional volume titles do not alter fallback labels", () => {
  assert.equal(volumeHeading(1), "Том 1");
  assert.equal(volumeHeading(2, "  Начало пути  "), "Том 2 — Начало пути");
  assert.equal(volumeHeading(null, "Без тома"), "Главы без тома");
  assert.equal(volumeHeading(3, ""), "Том 3");
});
