import "dotenv/config";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, comics, chapters, userComics, userChapterReads, administrativeAuditEvents } from "../src/db/schema";
import { appendSharedChapterBatch } from "../src/modules/catalog/shared-chapter-mutations";
import { parseChapterBatch } from "../src/modules/catalog/chapter-batch-input";

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
    const count = async () => (await db.select().from(chapters).where(eq(chapters.comicId, comic.id))).length;
    const auditCount = async () => (await db.select().from(administrativeAuditEvents).where(eq(administrativeAuditEvents.actorUserId, userId))).length;
    const text = "12.5\tOdd title\tMAIN\thttps://example.com/a\r\nExtra A\tBonus\tSPECIAL";
    const preview = await appendSharedChapterBatch(comic.id, text, "SCHEDULED", actor);
    assert.equal(await count(), 1); assert.equal(await auditCount(), 0);
    assert.deepEqual(preview.rows.map(row => row.sortOrder), [20, 30]);
    const created = await appendSharedChapterBatch(comic.id, text, "SCHEDULED", actor, preview.snapshot);
    assert.equal(created.createdCount, 2); assert.equal(await count(), 3); assert.equal(await auditCount(), 2);
    const registry = await db.select().from(chapters).where(eq(chapters.comicId, comic.id));
    assert.equal(registry.find(row => row.displayCode === "Extra A")!.kind, "SPECIAL");
    assert.equal(registry.find(row => row.displayCode === "12.5")!.releasedAt, null);
    await assert.rejects(appendSharedChapterBatch(comic.id, text, "SCHEDULED", actor, preview.snapshot));
    await assert.rejects(appendSharedChapterBatch(comic.id, "new\nold", "RELEASED", actor));
    assert.equal(await count(), 3);
    const stale = await appendSharedChapterBatch(comic.id, "next", "RELEASED", actor);
    await db.update(chapters).set({ title: "changed" }).where(eq(chapters.id, original.id));
    await assert.rejects(appendSharedChapterBatch(comic.id, "next", "RELEASED", actor, stale.snapshot));
    const retry = await appendSharedChapterBatch(comic.id, "next", "RELEASED", actor);
    await assert.rejects(appendSharedChapterBatch(comic.id, "next", "RELEASED", { ...actor, userId: -1 }, retry.snapshot));
    assert.equal(await count(), 3, "audit failure rolls back inserted chapters"); assert.equal(await auditCount(), 2);
    await appendSharedChapterBatch(comic.id, "next", "RELEASED", actor, retry.snapshot);
    await assert.rejects(appendSharedChapterBatch(privateComic.id, "one", "RELEASED", actor));
    assert.equal((await db.select().from(userChapterReads).where(eq(userChapterReads.userId, userId))).length, 1);
    assert.equal((await db.select().from(userChapterReads).where(eq(userChapterReads.userId, userId)))[0].readAt.toISOString(), readAt.toISOString());
    const diary = (await db.select().from(userComics).where(eq(userComics.userId, userId)))[0];
    assert.equal(diary.personalNote, "keep"); assert.equal(diary.ratingArt, 5); assert.equal(diary.status, "READING");
    assert.equal(parseChapterBatch(Array.from({ length: 100 }, (_, i) => String(i)).join("\n")).length, 100);
    for (const invalid of ["", "a\na", "a\tb\tBAD", "a\tb\tMAIN\tjavascript:alert(1)", "a\u0000", Array.from({ length: 101 }, (_, i) => String(i)).join("\n")]) assert.throws(() => parseChapterBatch(invalid));
    await db.update(chapters).set({ sortOrder: 2147483640 }).where(eq(chapters.id, original.id));
    await assert.rejects(appendSharedChapterBatch(comic.id, "overflow", "RELEASED", actor));
    console.log("PASS: batch preview, atomic create/audit rollback, duplicate/stale rejection, specials, limits, private boundary and diary preservation");
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
