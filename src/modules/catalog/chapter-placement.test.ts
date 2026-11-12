import assert from "node:assert/strict";
import test from "node:test";
import { planVolumeChapterPlacement, type PlacementExisting, type PlacementDraft } from "./chapter-placement";

const chapter = (id: number, volumeNumber: number | null, sortOrder: number): PlacementExisting => ({ id, volumeNumber, sortOrder });
const draft = (volumeNumber: number | null, mode: PlacementDraft["placementMode"] = "AUTO", anchorChapterId: number | null = null, supersedesChapterId: number | null = null): PlacementDraft => ({ volumeNumber, placementMode: mode, anchorChapterId, supersedesChapterId });

test("end of chosen volume preserves other volume order and does not use numeric user positions", () => {
  const existing = [chapter(1, 1, 2), chapter(2, 2, 27), chapter(3, 1, 13), chapter(4, null, 30)];
  const plan = planVolumeChapterPlacement(existing, [draft(1), draft(2), draft(null)]);
  assert.deepEqual(plan.newSortOrders, [30, 50, 70]);
  assert.deepEqual(plan.existingChanges.map(x => [x.id, x.sortOrder]), [[1, 10], [3, 20], [2, 40], [4, 60]]);
});

test("before/after same-volume anchors and repeated after rows respect input order", () => {
  const existing = [chapter(1, 1, 10), chapter(2, 1, 20), chapter(3, 2, 30)];
  const plan = planVolumeChapterPlacement(existing, [draft(1, "AFTER", 1), draft(1, "AFTER", 1), draft(1, "BEFORE", 2)]);
  assert.deepEqual(plan.newSortOrders, [20, 30, 40]);
  assert.deepEqual(plan.existingChanges, [{ id: 2, sortOrder: 50 }, { id: 3, sortOrder: 60 }]);
});

test("revision without an explicit location occupies old slot and leaves its ID untouched", () => {
  const existing = [chapter(1, 1, 10), chapter(2, 1, 20), chapter(3, 1, 30)];
  const plan = planVolumeChapterPlacement(existing, [draft(1, "AUTO", null, 2)]);
  assert.deepEqual(plan.newSortOrders, [20]);
  assert.deepEqual(plan.existingChanges, []);
});

test("reject anchors from other volumes, archived/replaced rows, duplicate replacements and phantom anchors", () => {
  const existing = [chapter(1, 1, 10), chapter(2, 2, 20)];
  assert.throws(() => planVolumeChapterPlacement(existing, [draft(1, "AFTER", 2)]), /томе/);
  assert.throws(() => planVolumeChapterPlacement(existing, [draft(1, "BEFORE", 99)]), /томе/);
  assert.throws(() => planVolumeChapterPlacement(existing, [draft(1, "AUTO", null, 1), draft(1, "AUTO", null, 1)]), /дважды/);
  assert.throws(() => planVolumeChapterPlacement(existing, [draft(1, "BEFORE", 1), draft(1, "AUTO", null, 1)]), /пакете/);
});

test("volume placement works independently of display codes, including ungrouped chapters", () => {
  const plan = planVolumeChapterPlacement([], [draft(2), draft(1), draft(1), draft(null)]);
  assert.deepEqual(plan.newSortOrders, [30, 10, 20, 40]);
});
