import assert from "node:assert/strict";
import test from "node:test";
import { getChapterReadingSource, getReadingTarget, readingSource } from "./reading-target";

const chapter = (id: number, overrides = {}) => ({ id, displayCode: `1.${id}а`, title: `Глава ${id}`, kind: "MAIN", status: "RELEASED", sortOrder: id, supersedesChapterId: null, sourceUrl: `https://vk.com/photo-1_${id}`, ...overrides });
const album = "https://vk.com/album-1_2";

test("selects the earliest unread by editorial order, not display code or last mark", () => {
  const chapters = [chapter(3, { displayCode: "1" }), chapter(1, { displayCode: "Extra" }), chapter(2)];
  const before = structuredClone(chapters);
  const result = getReadingTarget(chapters, [3], album);
  assert.equal(result.chapter?.id, 1);
  assert.equal(result.direct, true);
  assert.equal(result.source?.href, "https://vk.com/photo-1_1");
  assert.deepEqual(chapters, before);
});
test("ties are stable; read chapters, specials, scheduled and archived chapters are excluded", () => {
  const result = getReadingTarget([chapter(1, { status: "ARCHIVED" }), chapter(2, { status: "SCHEDULED" }), chapter(3, { kind: "SPECIAL" }), chapter(4), chapter(6, { sortOrder: 5 }), chapter(5)], [4], album);
  assert.equal(result.chapter?.id, 5);
});
test("old revision marks do not skip a replacement", () => {
  const result = getReadingTarget([chapter(1, { status: "ARCHIVED" }), chapter(2, { supersedesChapterId: 1 })], [1], album);
  assert.equal(result.chapter?.id, 2);
  assert.equal(result.state, "UNREAD");
});
test("missing or unsafe chapter URL falls back without skipping that chapter", () => {
  for (const sourceUrl of [null, "", "javascript:alert(1)", "data:text/html,test", "https://user:password@example.com/a"]) {
    const result = getReadingTarget([chapter(1, { sourceUrl }), chapter(2)], [], album);
    assert.equal(result.chapter?.id, 1);
    assert.equal(result.direct, false);
    assert.equal(result.source?.href, album);
    assert.equal(result.source?.label, "Открыть альбом в VK");
  }
});
test("caught up is distinct from absent released main chapters", () => {
  assert.equal(getReadingTarget([chapter(1)], [1], album).state, "CAUGHT_UP");
  for (const chapters of [[], [chapter(1, { kind: "SPECIAL" })], [chapter(1, { status: "SCHEDULED" })]]) {
    const result = getReadingTarget(chapters, [], album);
    assert.equal(result.state, "NO_MAIN");
    assert.equal(result.direct, false);
    assert.equal(result.chapter, null);
  }
});
test("unavailable sources retain a usable chapter-list fallback", () => {
  const result = getReadingTarget([chapter(1, { sourceUrl: null })], [], null);
  assert.equal(result.source, null);
  assert.equal(result.chapter?.id, 1);
});
test("source labels recognize VK host boundaries and album URLs", () => {
  assert.equal(readingSource("https://m.vk.ru/album-12_34")?.label, "Открыть альбом в VK");
  assert.equal(readingSource("https://vk.com/?z=album-12_34")?.label, "Открыть альбом в VK");
  assert.equal(readingSource("https://vk.com/wall-12_34")?.label, "Открыть в VK");
  assert.equal(readingSource("https://vk.com.evil.example/album-12_34")?.label, "Открыть источник");
  assert.equal(readingSource("https://example.com/chapter/1")?.label, "Открыть источник");
  assert.equal(readingSource("/relative/path"), null);
});

test("an unlinked middle chapter is never silently skipped", () => {
  const chapters = [chapter(1), chapter(2), chapter(3, { sourceUrl: null }), chapter(4)];
  const noSource = getReadingTarget(chapters, [1, 2], null);
  assert.equal(noSource.chapter?.id, 3);
  assert.equal(noSource.source, null);
  assert.equal(noSource.direct, false);
  const fallback = getReadingTarget(chapters, [1, 2], album);
  assert.equal(fallback.chapter?.id, 3);
  assert.equal(fallback.source?.href, album);
});


test("WD-LINK-02: direct chapter URLs take precedence over a general work URL", () => {
  const result = getChapterReadingSource("https://example.com/chapter/2", album, "RELEASED");
  assert.equal(result.kind, "direct");
  assert.equal(result.source?.href, "https://example.com/chapter/2");
});

test("WD-LINK-02: an unlinked released chapter uses an explicitly labeled general source", () => {
  const result = getChapterReadingSource(null, album, "RELEASED");
  assert.equal(result.kind, "general");
  assert.equal(result.source?.label, "Открыть альбом в VK");
  assert.equal(result.source?.href, album);
});

test("WD-LINK-02: missing or unsafe URLs never produce phantom links", () => {
  for (const chapterUrl of [null, "", "javascript:alert(1)", "https://user:secret@example.com"]) {
    const result = getChapterReadingSource(chapterUrl, null, "RELEASED");
    assert.equal(result.kind, "missing");
    assert.equal(result.source, null);
  }
  assert.equal(getChapterReadingSource(null, "data:text/html,bad", "RELEASED").kind, "missing");
});

test("WD-LINK-02: scheduled and archived chapters cannot be opened from the list", () => {
  for (const status of ["SCHEDULED", "ARCHIVED", "DRAFT"]) {
    const result = getChapterReadingSource("https://example.com/chapter/1", album, status);
    assert.equal(result.kind, "unavailable");
    assert.equal(result.source, null);
  }
});
