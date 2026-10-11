import "dotenv/config";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { db } from "../src/db";
import { chapters, comics, userChapterReads, userComics, users } from "../src/db/schema";
import { exportUserDiary } from "../src/modules/library/queries/export-user-diary";

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
    assert.deepEqual((await exportUserDiary(owner.id)).entries, []);
    await assert.rejects(exportUserDiary(-1));
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
      { userId: owner.id, comicId: shared.id, status: "READING", currentChapter: 77, personalNote: "Привет 🌸\n=SUM(1,2)\t\"цитата\"", ratingPlot: 5 },
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
    const exported = JSON.parse(JSON.stringify(await exportUserDiary(owner.id)));
    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.format, "comic-diary");
    assert.ok(!Number.isNaN(Date.parse(exported.exportedAt)));
    assert.equal(exported.entries.length, 4);
    assert.ok(!exported.entries.some((e: { comic: { id: number } }) => e.comic.id === foreign.id));
    const sharedEntry = exported.entries.find((e: { comic: { id: number } }) => e.comic.id === shared.id);
    assert.equal(sharedEntry.diary.personalNote, "Привет 🌸\n=SUM(1,2)\t\"цитата\"");
    assert.equal(sharedEntry.diary.ratings.plot, 5);
    assert.equal(sharedEntry.diary.ratings.art, null);
    assert.equal(sharedEntry.diary.storedCurrentChapter, 77);
    assert.equal(sharedEntry.diary.hasChapterRegistry, true);
    assert.equal(sharedEntry.chapterMarks.length, 4);
    assert.deepEqual(sharedEntry.chapterMarks.map((m: { status: string }) => m.status), ["RELEASED", "RELEASED", "ARCHIVED", "SCHEDULED"]);
    assert.ok(sharedEntry.chapterMarks.every((m: { markedAt: string }) => !Number.isNaN(Date.parse(m.markedAt))));
    assert.equal(exported.entries.find((e: { comic: { id: number } }) => e.comic.id === hidden.id).diary.trackingEnabled, false);
    const legacyEntry = exported.entries.find((e: { comic: { id: number } }) => e.comic.id === legacy.id);
    assert.equal(legacyEntry.diary.hasChapterRegistry, false);
    assert.equal(legacyEntry.diary.storedCurrentChapter, 12);
    assert.deepEqual(legacyEntry.chapterMarks, []);
    assert.deepEqual((await exportUserDiary(other.id)).entries, [], "orphan marks are outside the diary");
    const serialized = JSON.stringify(exported);
    for (const secret of [owner.email, other.email, 'passwordHash', 'password_hash', 'ownerUserId', 'userId', 'sessionToken']) assert.ok(!serialized.includes(secret));
    const { readFileSync } = await import("node:fs");
    const route = readFileSync("src/app/api/account/export/route.ts", "utf8");
    assert.ok(route.includes("exportUserDiary(user.id)"));
    assert.ok(route.includes('status: 401'));
    assert.ok(route.includes('private, no-store'));
    assert.ok(route.includes('attachment; filename='));
    assert.ok(!route.includes('searchParams'));
    console.log("PASS: empty export, Unicode/null preservation, ratings/progress, retained entries, archive/scheduled marks, ownership isolation and session-only endpoint contract");
  } finally {
    if (userIds.length) await db.delete(userChapterReads).where(inArray(userChapterReads.userId, userIds));
    if (comicIds.length) await db.delete(comics).where(inArray(comics.id, comicIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
