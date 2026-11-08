import { addComicToUserLibrary, setUserComicTracking, removeComicFromUserLibrary } from "../src/modules/library/mutations/update-user-comic-state";
import "dotenv/config";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { chapters, comics, userChapterReads, userComics, users, administrativeAuditEvents } from "../src/db/schema";
import { getChapterProgressCeiling } from "../src/modules/comics/queries/get-chapter-progress-ceiling";
import { getComicChapters } from "../src/modules/comics/queries/get-comic-chapters";
import { completeComicReading } from "../src/modules/library/mutations/complete-comic-reading";
import { completionSnapshot } from "../src/modules/library/completion-model";
import { updateChapterReading, markPreviousChaptersRead, undoPreviousChapterMarks, rateChaptersBatch } from "../src/modules/library/mutations/update-chapter-reading";
import { getUserComicState } from "../src/modules/library/queries/get-user-comic-state";
import { getUserLibrary } from "../src/modules/library/queries/get-user-library";
import { setLegacyComicProgress, setUserComicStatus } from "../src/modules/library/mutations/update-user-comic-state";
import { createSharedCatalogChapter, reorderSharedCatalogChapter, updateSharedCatalogChapter } from "../src/modules/catalog/shared-chapter-mutations";

import { getReadingUpdates, getUnreadChapters, parseUpdatesOptions } from "../src/modules/library/queries/get-reading-updates";

async function main() {
  if (process.env.COMIC_DIARY_TEST_ADAPTER) {
    const harness = await import(process.env.COMIC_DIARY_TEST_ADAPTER);
    await harness.attach(db.$client);
  }
  const stamp = `chapter-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const comicIds: number[] = [], userIds: number[] = [];
  try {
    const [reader, other] = await db.insert(users).values([{ email: `${stamp}@test.invalid` }, { email: `${stamp}-other@test.invalid` }]).returning();
    userIds.push(reader.id, other.id);
    const [comic, legacy, privateComic] = await db.insert(comics).values([
      { slug: stamp, title: "Reading probe", sourceUrl: "https://example.com", totalChapters: 999, seriesStatus: "FINISHED" },
      { slug: `${stamp}-legacy`, title: "Legacy", sourceUrl: "https://example.com", totalChapters: 12, seriesStatus: "FINISHED" },
      { slug: `${stamp}-private`, title: "Private", sourceUrl: "https://example.com", visibility: "PRIVATE", ownerUserId: other.id },
    ]).returning();
    comicIds.push(comic.id, legacy.id, privateComic.id);
    await db.insert(userComics).values([
      { userId: reader.id, comicId: comic.id, ratingArt: 4, personalNote: "Keep this note" },
      { userId: reader.id, comicId: legacy.id, currentChapter: 4 }, { userId: other.id, comicId: privateComic.id },
    ]);
    const [one, special, two, scheduled, privateChapter] = await db.insert(chapters).values([
      { comicId: comic.id, displayCode: "1", sortOrder: 1, status: "RELEASED" },
      { comicId: comic.id, displayCode: "Extra: чай", title: "Необычное название", kind: "SPECIAL", sortOrder: 2, status: "RELEASED" },
      { comicId: comic.id, displayCode: "1.5б", sortOrder: 3, status: "RELEASED" },
      { comicId: comic.id, displayCode: "Future", sortOrder: 4, status: "SCHEDULED", expectedRelease: "2026-11", sourceUrl: "https://example.com/unreleased-secret" },
      { comicId: privateComic.id, displayCode: "Private", sortOrder: 1, status: "RELEASED" },
    ]).returning();
    // Announcements are visible publicly, but unpublished source URLs are not.
    const publicChapters = await getComicChapters(comic.id, { includeScheduled: true });
    assert.equal(publicChapters.find(c => c.id === scheduled.id)?.expectedRelease, "2026-11");
    assert.equal(publicChapters.find(c => c.id === scheduled.id)?.sourceUrl, null);
    assert.equal((await getComicChapters(comic.id)).some(c => c.id === scheduled.id), false);
    await assert.rejects(updateChapterReading(reader.id, comic.id, scheduled.id, "rate", 5));
    const state = async () => (await getUserComicState(reader.id, comic.id))!;
    const options = parseUpdatesOptions({ status: "ALL", q: "Reading probe" });
    assert.equal((await getReadingUpdates(reader.id, options)).titles[0].mainCount, 2);
    assert.equal((await getUnreadChapters(reader.id, comic.id, "ALL", 0)).total, 3);
    assert.equal((await getUnreadChapters(reader.id, privateComic.id, "ALL", 0)).total, 0);
    assert.equal((await getUnreadChapters(other.id, comic.id, "ALL", 0)).total, 0);
    assert.equal((await getUnreadChapters(reader.id, comic.id, "MAIN", 0)).chapters[1].throughCount, 2);
    await updateChapterReading(reader.id, comic.id, two.id, "read-through");
    assert.equal((await state()).currentChapter, 2); assert.equal((await state()).progressCeiling, 2);
    assert.equal((await state()).status, "READING"); assert.equal((await state()).chapterReading.specialReadCount, 0);
    assert.equal((await state()).chapterReading.caughtUp, true);
    assert.equal((await getReadingUpdates(reader.id, { ...options, kind: "MAIN" })).total, 0);
    assert.equal((await getUnreadChapters(reader.id, comic.id, "SPECIAL", 0)).total, 1);
    await updateChapterReading(reader.id, comic.id, special.id, "read");
    assert.equal((await state()).chapterReading.specialReadCount, 1);
    const actor = { userId: reader.id, role: "ADMIN" as const };
    await reorderSharedCatalogChapter(comic.id, one.id, 20, actor);
    await updateSharedCatalogChapter(comic.id, two.id, { displayCode: "New name", title: "Renamed", sourceUrl: null, status: "RELEASED", releasedAt: null }, actor);
    assert.equal((await state()).currentChapter, 2);
    await assert.rejects(createSharedCatalogChapter(comic.id, { displayCode: "1", title: "Conflicting revision", sourceUrl: null,
      status: "RELEASED", releasedAt: new Date(), sortOrder: 3, supersedesChapterId: two.id }, actor));
    assert.equal((await db.select().from(chapters).where(eq(chapters.id, two.id)))[0].status, "RELEASED", "failed replacement must roll back archive");
    const revision = await createSharedCatalogChapter(comic.id, { displayCode: "New name", title: "Revision", sourceUrl: null,
      status: "RELEASED", releasedAt: new Date(), sortOrder: 3, kind: "MAIN", supersedesChapterId: two.id }, actor);
    assert.equal((await state()).currentChapter, 1); assert.equal((await state()).chapterReading.updatedChapters, 1);
    assert.equal((await state()).chapterReading.caughtUp, false); assert((await state()).chapterReading.readIds.includes(two.id));
    await updateChapterReading(reader.id, comic.id, revision.id, "read");
    await updateChapterReading(reader.id, comic.id, revision.id, "read");
    assert.equal((await state()).currentChapter, 2);
    const revision2 = await createSharedCatalogChapter(comic.id, { displayCode: "New name", title: "Revision 2", sourceUrl: null,
      status: "RELEASED", releasedAt: new Date(), sortOrder: 3, supersedesChapterId: revision.id }, actor);
    assert.equal((await state()).chapterReading.updatedChapters, 1);
    assert.equal((await getUnreadChapters(reader.id, comic.id, "UPDATED", 0)).chapters[0].id, revision2.id);
    assert.equal((await getReadingUpdates(reader.id, { ...options, kind: "UPDATED" })).titles[0].updatedCount, 1);
    for (const [uid, cid, chid, action] of [
      [reader.id, comic.id, scheduled.id, "read"], [other.id, comic.id, revision2.id, "read"],
      [reader.id, comic.id, privateChapter.id, "read"], [reader.id, privateComic.id, privateChapter.id, "read"],
      [reader.id, comic.id, special.id, "read-through"],
    ] as const) await assert.rejects(updateChapterReading(uid, cid, chid, action));
    await assert.rejects(createSharedCatalogChapter(comic.id, { displayCode: "Invalid", title: null, sourceUrl: null,
      status: "RELEASED", releasedAt: null, sortOrder: 3, supersedesChapterId: privateChapter.id }, actor));
    await assert.rejects(setLegacyComicProgress(reader.id, comic.id, 2));
    await setLegacyComicProgress(reader.id, legacy.id, 7);
    assert.equal((await getUserComicState(reader.id, legacy.id))!.currentChapter, 7);
    assert.equal((await getUserComicState(reader.id, legacy.id))!.progressCeiling, null);
    assert.equal(await getChapterProgressCeiling(legacy.id), 0, "declared total cannot fabricate available chapters");
    await setLegacyComicProgress(reader.id, legacy.id, 15);
    assert.equal((await getUserComicState(reader.id, legacy.id))!.currentChapter, 15, "declared total must not clamp a personal counter");
    await setLegacyComicProgress(reader.id, legacy.id, 7);
    await assert.rejects(setUserComicStatus(reader.id, comic.id, "COMPLETED"));
    assert.equal((await state()).status, "READING", "unconfirmed completion changes nothing");
    await updateChapterReading(reader.id, comic.id, special.id, "unread");
    const beforeAvailable = await state();
    for (const seriesStatus of ["UNKNOWN", "ONGOING", "HIATUS", "CANCELLED"] as const) {
      await db.update(comics).set({ seriesStatus }).where(eq(comics.id, comic.id));
      const pendingSnapshot = completionSnapshot((await state()).chapterReading.registry, comic.totalChapters, seriesStatus);
      await assert.rejects(completeComicReading(reader.id, comic.id, "ALL", pendingSnapshot));
      assert.equal((await state()).status, "READING");
      assert.equal((await state()).chapterReading.specialReadCount, 0, "rejected completion must not read specials");
      await completeComicReading(reader.id, comic.id, "MAIN", pendingSnapshot, "AVAILABLE");
      assert.equal((await state()).status, "READING");
      assert.equal((await state()).completedAt, null);
      assert.equal((await state()).chapterReading.caughtUp, true);
      assert.equal((await state()).trackingEnabled, true);
      await updateChapterReading(reader.id, comic.id, revision2.id, "unread");
    }
    await db.update(comics).set({ seriesStatus: "FINISHED" }).where(eq(comics.id, comic.id));
    assert.deepEqual((await state()).chapterReading.readIds, beforeAvailable.chapterReading.readIds);
    await assert.rejects(completeComicReading(reader.id, comic.id, "MAIN", completionSnapshot((await state()).chapterReading.registry, comic.totalChapters, "FINISHED")), "scheduled main chapter blocks completion");
    await db.update(chapters).set({ kind: "SPECIAL" }).where(eq(chapters.id, scheduled.id));
    const snapshot = completionSnapshot((await state()).chapterReading.registry, comic.totalChapters, "FINISHED");
    await db.update(comics).set({ seriesStatus: "ONGOING" }).where(eq(comics.id, comic.id));
    await assert.rejects(completeComicReading(reader.id, comic.id, "ALL", snapshot));
    await db.update(comics).set({ seriesStatus: "FINISHED" }).where(eq(comics.id, comic.id));
    console.log("PASS: publication-aware completion, available-only reading, all non-finished states, stale publication snapshot and tracking retention");
    const oldMark = (await db.select().from(userChapterReads).where(eq(userChapterReads.chapterId, one.id)))[0].readAt;
    await assert.rejects(completeComicReading(reader.id, comic.id, "ALL", "stale"));
    assert.equal((await state()).currentChapter, 1, "stale snapshot must roll back");
    await assert.rejects(completeComicReading(other.id, comic.id, "ALL", snapshot));
    await assert.rejects(completeComicReading(reader.id, privateComic.id, "ALL", snapshot));
    await completeComicReading(reader.id, comic.id, "MAIN", snapshot);
    assert.equal((await state()).status, "COMPLETED");
    assert.equal((await state()).currentChapter, 2);
    assert.equal((await state()).chapterReading.specialReadCount, 0);
    assert(!(await state()).chapterReading.readIds.includes(scheduled.id));
    assert.equal((await db.select().from(userChapterReads).where(eq(userChapterReads.chapterId, one.id)))[0].readAt.getTime(), oldMark.getTime());
    await completeComicReading(reader.id, comic.id, "ALL", snapshot);
    const completedAt = (await state()).completedAt;
    assert.equal((await state()).trackingEnabled, true, "completion never disables tracking");
    const savedEntry = (await db.select().from(userComics).where(eq(userComics.comicId, comic.id)))[0];
    const savedReads = (await state()).chapterReading.readIds;
    await db.update(chapters).set({ status: "RELEASED" }).where(eq(chapters.id, scheduled.id));
    assert.equal((await getReadingUpdates(reader.id, parseUpdatesOptions({ q: "Reading probe" }))).total, 1, "completed tracked title appears by default");
    await removeComicFromUserLibrary(reader.id, comic.id);
    assert.equal((await state()).inLibrary, false, "removed title must be off the shelf");
    assert.equal((await state()).trackingEnabled, true, "removal must retain tracking preference");
    assert.equal((await getUserLibrary(reader.id)).some(i => i.comicId === comic.id), false, "removed title must not appear on the shelf");
    await setUserComicTracking(reader.id, comic.id, false);
    assert.equal((await getReadingUpdates(reader.id, options)).total, 0);
    assert.equal((await getUnreadChapters(reader.id, comic.id, "ALL", 0)).total, 0);
    assert.deepEqual((await state()).chapterReading.readIds, savedReads);
    assert.equal((await state()).trackingEnabled, false);
    const preserved = await state();
    assert.equal(preserved.inLibrary, false);
    assert.equal(preserved.personalNote, savedEntry.personalNote); assert.equal(preserved.ratingArt, savedEntry.ratingArt);
    assert.equal(preserved.status, savedEntry.status);
    assert.equal(preserved.startedAt?.getTime(), savedEntry.startedAt?.getTime());
    assert.equal(preserved.completedAt?.getTime(), savedEntry.completedAt?.getTime());
    await assert.rejects(setUserComicTracking(other.id, comic.id, false));
    await assert.rejects(setUserComicTracking(reader.id, privateComic.id, false));
    await setUserComicTracking(other.id, privateComic.id, false);
    assert.equal((await getUserComicState(other.id, privateComic.id))!.trackingEnabled, false);
    await setUserComicTracking(other.id, privateComic.id, true);
    await setUserComicTracking(reader.id, comic.id, true);
    assert.equal((await getReadingUpdates(reader.id, options)).total, 0, "tracking alone must not restore a removed title");
    await addComicToUserLibrary(reader.id, comic.id);
    assert.equal((await state()).inLibrary, true, "re-adding restores shelf membership");
    assert.equal((await getReadingUpdates(reader.id, options)).total, 1, "restored tracked title exposes missed unread chapters");
    await db.update(chapters).set({ status: "SCHEDULED" }).where(eq(chapters.id, scheduled.id));
    console.log("PASS: independent tracking, completed-title updates, soft removal, diary retention, shelf restoration and ownership");
    await db.update(chapters).set({ status: "RELEASED" }).where(eq(chapters.id, scheduled.id));
    await assert.rejects(completeComicReading(reader.id, comic.id, "ALL", snapshot));
    assert(!(await state()).chapterReading.readIds.includes(scheduled.id), "new release is not implicitly read");
    await db.update(chapters).set({ status: "SCHEDULED" }).where(eq(chapters.id, scheduled.id));
    await completeComicReading(reader.id, comic.id, "ALL", snapshot);
    assert.equal((await state()).chapterReading.specialReadCount, 1);
    assert.equal((await state()).completedAt?.getTime(), completedAt?.getTime());
    await setUserComicStatus(reader.id, comic.id, "READING");
    assert.equal((await state()).currentChapter, 2, "returning to reading preserves marks");
    await assert.rejects(completeComicReading(reader.id, legacy.id, "LEGACY", completionSnapshot([], 12, "FINISHED")));
    await completeComicReading(reader.id, legacy.id, "STATUS_ONLY", completionSnapshot([], 12, "FINISHED"));
    assert.equal((await getUserComicState(reader.id, legacy.id))!.currentChapter, 7);
    await updateChapterReading(reader.id, comic.id, one.id, "unread");
    await updateChapterReading(reader.id, comic.id, revision2.id, "unread");
    const entry = (await getUserLibrary(reader.id)).find((i) => i.comicId === comic.id)!;
    assert.equal(entry.currentChapter, 0); assert.equal(entry.ratingArt, 4); assert.equal(entry.personalNote, "Keep this note");
    console.log("PASS: confirmed MAIN/ALL completion, stale snapshot rollback, ownership, old read dates, repeat completion and legacy counter");
    const [unknown] = await db.insert(comics).values({ slug: `${stamp}-unknown`, title: "Unknown count", sourceUrl: "https://example.com", seriesStatus: "FINISHED" }).returning();
    comicIds.push(unknown.id);
    await db.insert(userComics).values({ userId: reader.id, comicId: unknown.id, currentChapter: 7 });
    await assert.rejects(completeComicReading(reader.id, unknown.id, "LEGACY", completionSnapshot([], null, "FINISHED")));
    await completeComicReading(reader.id, unknown.id, "STATUS_ONLY", completionSnapshot([], null, "FINISHED"));
    assert.equal((await getUserComicState(reader.id, unknown.id))!.currentChapter, 7);
    await db.delete(userComics).where(eq(userComics.comicId, unknown.id));
    const moreTitles = await db.insert(comics).values(Array.from({ length: 21 }, (_, i) => ({ slug: `${stamp}-page-${i}`, title: `${stamp} Page ${i}`, sourceUrl: "https://example.com" }))).returning();
    comicIds.push(...moreTitles.map((c) => c.id));
    await db.insert(userComics).values(moreTitles.map((c) => ({ userId: reader.id, comicId: c.id, status: "READING" as const })));
    await db.insert(chapters).values(moreTitles.flatMap((c, i) => Array.from({ length: i === 0 ? 61 : 1 }, (_, n) => ({ comicId: c.id, displayCode: String(n + 1), sortOrder: n, status: "RELEASED" as const }))));
    const paged = parseUpdatesOptions({ q: `${stamp} Page` });
    const page1 = await getReadingUpdates(reader.id, paged), page2 = await getReadingUpdates(reader.id, { ...paged, page: 2 });
    assert.equal(page1.total, 21); assert.equal(page1.titles.length, 20); assert.equal(page2.titles.length, 1);
    assert.equal((await getReadingUpdates(reader.id, { ...paged, page: 99 })).total, 21);
    const chunk1 = await getUnreadChapters(reader.id, moreTitles[0].id, "MAIN", 0), chunk2 = await getUnreadChapters(reader.id, moreTitles[0].id, "MAIN", 30);
    assert.equal(chunk1.total, 61); assert.equal(chunk1.chapters.length, 30); assert.equal(chunk2.chapters.length, 30);
    assert(!chunk1.chapters.some((c) => chunk2.chapters.some((d) => c.id === d.id)));
    assert.equal((await getReadingUpdates(reader.id, parseUpdatesOptions({ status: "ALL", q: "%_'" }))).total, 0);
    assert.equal((await getReadingUpdates(reader.id, parseUpdatesOptions({ status: "ALL" }))).missingCount, 1);
    const beforeDates = (await db.select().from(chapters).where(eq(chapters.id, scheduled.id)))[0];
    assert.equal(beforeDates.expectedRelease, "2026-11", "scheduled month must be stored without an invented day");
    const revisedPlan = await updateSharedCatalogChapter(comic.id, scheduled.id,
      { displayCode: "Future", title: "Scheduled", sourceUrl: null, status: "SCHEDULED", releasedAt: null, expectedRelease: "2027-12" }, actor);
    assert.equal(revisedPlan.expectedRelease, "2027-12");
    assert.equal(revisedPlan.createdAt.getTime(), beforeDates.createdAt.getTime(), "editing must not change date added");
    await assert.rejects(updateSharedCatalogChapter(comic.id, scheduled.id,
      { displayCode: "Future", title: "Bad date", sourceUrl: null, status: "SCHEDULED", releasedAt: null, expectedRelease: "2027-02-30" }, actor));
    const publishedDate = new Date("2026-02-10T12:00:00.000Z");
    const publishedChapter = await updateSharedCatalogChapter(comic.id, scheduled.id,
      { displayCode: "Future", title: "Published", sourceUrl: null, status: "RELEASED", releasedAt: publishedDate, expectedRelease: null }, actor);
    assert.equal(publishedChapter.releasedAt?.toISOString(), publishedDate.toISOString());
    assert.equal(publishedChapter.expectedRelease, null, "publication clears the old plan");
    assert.equal(publishedChapter.id, scheduled.id, "same chapter identity must be preserved");
    // WD18.2: a receipt contains only new marks; ratings and earlier reads survive undo.
    const [bulkComic] = await db.insert(comics).values({ slug: `${stamp}-bulk`, title: "Bulk prompt", sourceUrl: "https://example.com" }).returning();
    comicIds.push(bulkComic.id);
    await db.insert(userComics).values({ userId: reader.id, comicId: bulkComic.id });
    const [b1, b2, planned, bonus, b5, b6] = await db.insert(chapters).values([
      { comicId: bulkComic.id, displayCode: "1", sortOrder: 1, status: "RELEASED" },
      { comicId: bulkComic.id, displayCode: "2", sortOrder: 2, status: "RELEASED" },
      { comicId: bulkComic.id, displayCode: "3", sortOrder: 3, status: "SCHEDULED" },
      { comicId: bulkComic.id, displayCode: "4", sortOrder: 4, status: "RELEASED", kind: "SPECIAL" },
      { comicId: bulkComic.id, displayCode: "5", sortOrder: 5, status: "RELEASED" },
      { comicId: bulkComic.id, displayCode: "6", sortOrder: 6, status: "RELEASED" },
    ]).returning();
    await updateChapterReading(reader.id, bulkComic.id, b1.id, "read");
    await updateChapterReading(reader.id, bulkComic.id, b1.id, "rate", 5);
    await updateChapterReading(reader.id, bulkComic.id, b6.id, "read");
    const receipt = await markPreviousChaptersRead(reader.id, bulkComic.id, b6.id);
    assert.deepEqual(receipt.addedIds.sort((a, b) => a - b), [b2.id, b5.id].sort((a, b) => a - b));
    assert.equal((await getUserComicState(reader.id, bulkComic.id))?.currentChapter, 4);
    assert(!(await getUserComicState(reader.id, bulkComic.id))?.chapterReading.readIds.includes(planned.id));
    assert(!(await getUserComicState(reader.id, bulkComic.id))?.chapterReading.readIds.includes(bonus.id));
    await undoPreviousChapterMarks(reader.id, bulkComic.id, receipt.addedIds);
    assert.equal((await getUserComicState(reader.id, bulkComic.id))?.currentChapter, 2);
    assert((await getUserComicState(reader.id, bulkComic.id))?.chapterReading.readIds.includes(b1.id));
    assert((await getUserComicState(reader.id, bulkComic.id))?.chapterReading.readIds.includes(b6.id));
    assert.equal((await db.select().from(userChapterReads).where(eq(userChapterReads.chapterId, b1.id)))[0].rating, 5);
    const again = await markPreviousChaptersRead(reader.id, bulkComic.id, b6.id);
    await rateChaptersBatch(reader.id, bulkComic.id, [{ id: b2.id, rating: 4 }, { id: b6.id, rating: 3 }]);
    assert.equal((await db.select().from(userChapterReads).where(eq(userChapterReads.chapterId, b5.id)))[0].rating, null, "unrated chapter stays unrated");
    await assert.rejects(undoPreviousChapterMarks(reader.id, bulkComic.id, again.addedIds), "rated marks cannot be deleted by undo");
    assert.equal((await getUserComicState(reader.id, bulkComic.id))?.currentChapter, 4, "failed undo is atomic");
    await assert.rejects(rateChaptersBatch(reader.id, bulkComic.id, [{ id: planned.id, rating: 5 }]));
    await assert.rejects(rateChaptersBatch(reader.id, bulkComic.id, [{ id: bonus.id, rating: 5 }]));
    await assert.rejects(rateChaptersBatch(other.id, bulkComic.id, [{ id: b2.id, rating: 5 }]));
    await assert.rejects(undoPreviousChapterMarks(reader.id, bulkComic.id, [planned.id]));
    console.log("PASS: WD18.2 transactional bulk receipt, safe undo, selective ratings, planned/special/ownership guards");
    console.log("PASS: WD21 planned precision, past release, original creation date and publishing transitions");
    console.log("PASS: updates filters, counts, pagination, revision ancestry and access isolation");
    console.log("PASS: read-through, specials, rename/reorder, two revisions, history, idempotency, access isolation, legacy, explicit completion, ratings/notes");
  } finally {
    if (userIds.length) {
      await db.delete(userChapterReads).where(inArray(userChapterReads.userId, userIds));
      await db.delete(administrativeAuditEvents).where(inArray(administrativeAuditEvents.actorUserId, userIds));
      await db.delete(userComics).where(inArray(userComics.userId, userIds));
    }
    if (comicIds.length) {
      const rows = await db.select().from(chapters).where(inArray(chapters.comicId, comicIds));
      for (const c of rows.sort((a, b) => b.id - a.id)) await db.delete(chapters).where(eq(chapters.id, c.id));
      await db.delete(comics).where(inArray(comics.id, comicIds));
    }
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
