import "dotenv/config";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { chapters, comics, userChapterReads, userComics, users } from "../src/db/schema";
import { getUserReadingStats } from "../src/modules/library/queries/get-user-reading-stats";

async function main() {
  db.$client.options.max = 1;
  if (process.env.COMIC_DIARY_TEST_ADAPTER) {
    const harness = await import(process.env.COMIC_DIARY_TEST_ADAPTER);
    await harness.attach(db.$client);
  }
  const stamp = `stats-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const userIds: number[] = [], comicIds: number[] = [];
  try {
    const [owner, other] = await db.insert(users).values([
      { email: `${stamp}@test.invalid` }, { email: `${stamp}-other@test.invalid` },
    ]).returning();
    userIds.push(owner.id, other.id);
    const zero = { titles: 0, tracked: 0, planned: 0, reading: 0, completed: 0, onHold: 0, main: 0, specials: 0, archived: 0, legacyTitles: 0 };
    assert.deepEqual(await getUserReadingStats(owner.id), zero);
    await assert.rejects(getUserReadingStats(-1));
    const inserted = await db.insert(comics).values([
      { slug: `${stamp}-shared`, title: "Shared", sourceUrl: "https://example.com", totalChapters: 999 },
      { slug: `${stamp}-hidden`, title: "Hidden", sourceUrl: "https://example.com", publicationStatus: "HIDDEN" as const },
      { slug: `${stamp}-own`, title: "Own", sourceUrl: "https://example.com", visibility: "PRIVATE" as const, ownerUserId: owner.id },
      { slug: `${stamp}-legacy`, title: "Legacy", sourceUrl: "https://example.com", totalChapters: 100 },
      { slug: `${stamp}-foreign`, title: "Foreign", sourceUrl: "https://example.com", visibility: "PRIVATE" as const, ownerUserId: other.id },
    ]).returning();
    comicIds.push(...inserted.map((c) => c.id));
    const [shared, hidden, own, legacy, foreign] = inserted;
    await db.insert(userComics).values([
      { userId: owner.id, comicId: shared.id, status: "READING", currentChapter: 77 },
      { userId: owner.id, comicId: hidden.id, status: "COMPLETED", trackingEnabled: false },
      { userId: owner.id, comicId: own.id, status: "ON_HOLD" },
      { userId: owner.id, comicId: legacy.id, currentChapter: 12 },
      // Deliberately corrupted association must not expose a foreign private title.
      { userId: owner.id, comicId: foreign.id, status: "COMPLETED" },
    ]);
    const chapterRows = await db.insert(chapters).values([
      { comicId: shared.id, displayCode: "1", sortOrder: 10, status: "RELEASED" as const },
      { comicId: shared.id, displayCode: "Extra", sortOrder: 20, status: "RELEASED" as const, kind: "SPECIAL" },
      { comicId: shared.id, displayCode: "Old", sortOrder: 30, status: "ARCHIVED" as const },
      { comicId: shared.id, displayCode: "Future", sortOrder: 40, status: "SCHEDULED" as const },
      { comicId: own.id, displayCode: "1", sortOrder: 10, status: "RELEASED" as const },
      { comicId: foreign.id, displayCode: "1", sortOrder: 10, status: "RELEASED" as const },
    ]).returning();
    await db.insert(userChapterReads).values(chapterRows.map((ch) => ({ userId: owner.id, chapterId: ch.id })));
    await db.insert(userChapterReads).values({ userId: other.id, chapterId: chapterRows[0].id });
    assert.deepEqual(await getUserReadingStats(owner.id), {
      titles: 4, tracked: 3, planned: 1, reading: 1, completed: 1, onHold: 1,
      main: 2, specials: 1, archived: 1, legacyTitles: 1,
    });
    assert.deepEqual(await getUserReadingStats(other.id), zero, "marks without a diary entry are outside the library snapshot");
    await db.update(userComics).set({ trackingEnabled: false }).where(eq(userComics.userId, owner.id));
    const unsubscribed = await getUserReadingStats(owner.id);
    assert.equal(unsubscribed.tracked, 0);
    assert.equal(unsubscribed.titles, 4);
    assert.equal(unsubscribed.main, 2);
    await db.delete(userChapterReads).where(eq(userChapterReads.chapterId, chapterRows[0].id));
    assert.equal((await getUserReadingStats(owner.id)).main, 1, "removing a mark decreases the current counter");
    console.log("PASS: empty diary, status partition, independent tracking, released MAIN/SPECIAL, archived separation, scheduled exclusion, legacy separation and owner isolation");
  } finally {
    if (userIds.length) await db.delete(userChapterReads).where(inArray(userChapterReads.userId, userIds));
    if (comicIds.length) await db.delete(comics).where(inArray(comics.id, comicIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
