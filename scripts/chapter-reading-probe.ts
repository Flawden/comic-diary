import "dotenv/config";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { chapters, comics, userChapterReads, userComics, users, administrativeAuditEvents } from "../src/db/schema";
import { updateChapterReading } from "../src/modules/library/mutations/update-chapter-reading";
import { getUserComicState } from "../src/modules/library/queries/get-user-comic-state";
import { getUserLibrary } from "../src/modules/library/queries/get-user-library";
import { setLegacyComicProgress, setUserComicStatus } from "../src/modules/library/mutations/update-user-comic-state";
import { createSharedCatalogChapter, reorderSharedCatalogChapter, updateSharedCatalogChapter } from "../src/modules/catalog/shared-chapter-mutations";

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
      { slug: stamp, title: "Reading probe", sourceUrl: "https://example.com", totalChapters: 999 },
      { slug: `${stamp}-legacy`, title: "Legacy", sourceUrl: "https://example.com", totalChapters: 12 },
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
      { comicId: comic.id, displayCode: "Future", sortOrder: 4, status: "SCHEDULED" },
      { comicId: privateComic.id, displayCode: "Private", sortOrder: 1, status: "RELEASED" },
    ]).returning();
    const state = async () => (await getUserComicState(reader.id, comic.id))!;
    await updateChapterReading(reader.id, comic.id, two.id, "read-through");
    assert.equal((await state()).currentChapter, 2); assert.equal((await state()).progressCeiling, 2);
    assert.equal((await state()).status, "READING"); assert.equal((await state()).chapterReading.specialReadCount, 0);
    assert.equal((await state()).chapterReading.caughtUp, true);
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
    await setUserComicStatus(reader.id, comic.id, "COMPLETED");
    assert.equal((await state()).currentChapter, 1);
    await updateChapterReading(reader.id, comic.id, one.id, "unread"); assert.equal((await state()).currentChapter, 0);
    const entry = (await getUserLibrary(reader.id)).find((i) => i.comicId === comic.id)!;
    assert.equal(entry.currentChapter, 0); assert.equal(entry.ratingArt, 4); assert.equal(entry.personalNote, "Keep this note");
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
