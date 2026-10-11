import "dotenv/config";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, comics, chapters, userComics, userChapterReads, administrativeAuditEvents } from "../src/db/schema";
import { moveSharedCatalogChapter } from "../src/modules/catalog/shared-chapter-mutations";

async function main() {
  db.$client.options.max = 1;
  if (process.env.COMIC_DIARY_TEST_ADAPTER) await (await import(process.env.COMIC_DIARY_TEST_ADAPTER)).attach(db.$client);
  const ids: number[] = []; let userId = 0;
  try {
    const stamp = `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [user] = await db.insert(users).values({ email: `${stamp}@test.invalid` }).returning(); userId = user.id;
    const [comic, privateComic] = await db.insert(comics).values([
      { slug: stamp, title: stamp, sourceUrl: "https://example.com" }, { slug: `${stamp}-private`, title: stamp, sourceUrl: "https://example.com", visibility: "PRIVATE", ownerUserId: userId },
    ]).returning(); ids.push(comic.id, privateComic.id);
    const actor = { userId, role: "ADMIN" as const };
    const [original] = await db.insert(chapters).values({ comicId: comic.id, displayCode: "old", sortOrder: 10, status: "RELEASED" }).returning();
    const readAt = new Date("2020-01-01T00:00:00Z");
    await db.insert(userChapterReads).values({ userId, chapterId: original.id, readAt });
    await db.insert(userComics).values({ userId, comicId: comic.id, status: "READING", personalNote: "keep", ratingArt: 5 });
    const [second, bonus, archived] = await db.insert(chapters).values([
      { comicId: comic.id, displayCode: "second", sortOrder: 100, status: "SCHEDULED" },
      { comicId: comic.id, displayCode: "bonus", sortOrder: 200, status: "RELEASED", kind: "SPECIAL" },
      { comicId: comic.id, displayCode: "archived", sortOrder: 15, status: "ARCHIVED" },
    ]).returning();
    const registry = async () => await db.select().from(chapters).where(eq(chapters.comicId, comic.id));
    const order = async () => (await registry()).filter(c => c.status !== "ARCHIVED").sort((a,b) => a.sortOrder-b.sortOrder || a.id-b.id).map(c => c.id);
    const expected = { sortOrder: 100, neighborId: original.id, neighborSortOrder: 10 };
    await moveSharedCatalogChapter(comic.id, second.id, "up", expected, actor);
    assert.deepEqual(await order(), [second.id, original.id, bonus.id]);
    assert.equal((await registry()).find(c => c.id === archived.id)!.sortOrder, 15);
    const after = await registry();
    await assert.rejects(moveSharedCatalogChapter(comic.id, second.id, "up", expected, actor));
    assert.deepEqual(await registry(), after, "stale request does not write");
    await assert.rejects(moveSharedCatalogChapter(comic.id, original.id, "down", { sortOrder:100, neighborId:bonus.id, neighborSortOrder:200 }, { ...actor, userId:-1 }));
    assert.deepEqual(await registry(), after, "audit failure rolls back both orders");
    await assert.rejects(moveSharedCatalogChapter(privateComic.id, original.id, "down", expected, actor));
    await assert.rejects(moveSharedCatalogChapter(comic.id, archived.id, "up", expected, actor));
    await db.update(chapters).set({ sortOrder:10 }).where(eq(chapters.id, original.id));
    const tied = (await registry()).filter(c => c.status !== "ARCHIVED").sort((a,b) => a.sortOrder-b.sortOrder || a.id-b.id);
    await moveSharedCatalogChapter(comic.id, tied[1].id, "up", { sortOrder:tied[1].sortOrder, neighborId:tied[0].id, neighborSortOrder:tied[0].sortOrder }, actor);
    assert.deepEqual(await order(), [tied[1].id, tied[0].id, bonus.id]);
    assert.equal(new Set((await registry()).filter(c => c.status !== "ARCHIVED").map(c => c.sortOrder)).size, 3);
    const read = (await db.select().from(userChapterReads).where(eq(userChapterReads.userId,userId)))[0];
    assert.equal(read.chapterId, original.id); assert.equal(read.readAt.toISOString(),readAt.toISOString());
    const diary = (await db.select().from(userComics).where(eq(userComics.userId,userId)))[0];
    assert.equal(diary.personalNote,"keep"); assert.equal(diary.ratingArt,5);
    console.log("PASS: adjacent moves, gaps, ties, specials, archive/private boundaries, stale rejection, audit rollback and reading preservation");
  } finally {
    if (userId) {
      await db.delete(administrativeAuditEvents).where(eq(administrativeAuditEvents.actorUserId, userId));
      await db.delete(userChapterReads).where(eq(userChapterReads.userId, userId));
    }
    if (ids.length) await db.delete(comics).where(inArray(comics.id, ids));
    if (userId) await db.delete(users).where(eq(users.id, userId));
    await db.$client.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
