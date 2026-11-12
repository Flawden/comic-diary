import assert from "node:assert/strict";
import test from "node:test";
import { parseStructuredChapterBatch } from "./chapter-structured-batch";

const normal = () => ({
  displayCode: "1", title: "Начало", sourceUrl: "https://example.com/1",
  kind: "MAIN", status: "RELEASED", volumeNumber: 1, placementMode: "AUTO", anchorChapterId: null,
  releasedAt: "2026-11-01T12:00:00.000Z", expectedRelease: null,
  supersedesChapterId: null, revisionConfirmed: false,
});

test("structured batch preserves per-row metadata and dates", () => {
  const scheduled = {
    ...normal(), displayCode: "2", status: "SCHEDULED", releasedAt: null,
    expectedRelease: "2027-04",
  };
  const result = parseStructuredChapterBatch([normal(), scheduled]);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(row => row.expectedRelease), [null, "2027-04"]);
  assert.deepEqual(result.map(row => row.volumeNumber), [1, 1]);
});

test("structured batch rejects duplicate codes, dates, ambiguous revisions and extra keys", () => {
  assert.throws(() => parseStructuredChapterBatch([normal(), normal()]), /повторяется/);
  assert.throws(() => parseStructuredChapterBatch([{ ...normal(), releasedAt: "2026-02-30T12:00:00.000Z" }]), /дата/);
  assert.throws(() => parseStructuredChapterBatch([{ ...normal(), supersedesChapterId: 1 }]), /подтвердите/);
  assert.throws(() => parseStructuredChapterBatch([{ ...normal(), sortOrder: 3 }]), /неизвестные/);
  assert.throws(() => parseStructuredChapterBatch([{ ...normal(), placementMode: "BEFORE" }]), /главу/);
  assert.throws(() => parseStructuredChapterBatch([{ ...normal(), placementMode: "AUTO", anchorChapterId: 5 }]), /главу/);
  assert.throws(() => parseStructuredChapterBatch([{ ...normal(), extra: "ignored?" }]), /неизвестные/);
  assert.throws(() => parseStructuredChapterBatch([{ ...normal(), status: "SCHEDULED", expectedRelease: "2027", supersedesChapterId: 1, revisionConfirmed: true, releasedAt: null }]), /подтвердите/);
});

test("structured batch requires confirmation once per distinct replaced chapter", () => {
  const revision = { ...normal(), supersedesChapterId: 42, revisionConfirmed: true };
  assert.equal(parseStructuredChapterBatch([revision])[0].supersedesChapterId, 42);
  assert.throws(() => parseStructuredChapterBatch([revision, { ...revision, displayCode: "2" }]), /дважды/);
});

test("scheduled chapters without links remain valid", () => {
  const row = { ...normal(), displayCode: "", title: "Ожидается", sourceUrl: null,
    status: "SCHEDULED", releasedAt: null };
  assert.equal(parseStructuredChapterBatch([row])[0].sourceUrl, null);
});

test("batch size and URL protocol are bounded", () => {
  assert.throws(() => parseStructuredChapterBatch([]), /от 1/);
  assert.throws(() => parseStructuredChapterBatch(Array.from({ length: 101 }, (_, i) => ({ ...normal(), displayCode: String(i) }))), /от 1/);
  assert.throws(() => parseStructuredChapterBatch([{ ...normal(), sourceUrl: "javascript:alert(1)" }]), /HTTP/);
});
