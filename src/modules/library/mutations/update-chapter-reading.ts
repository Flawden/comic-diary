import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { chapters, comics, userChapterReads, userComics } from "@/db/schema";
import { selectReadThrough } from "../chapter-reading-model";
import { SHARED_CATALOG_ADVISORY_LOCK } from "@/modules/catalog/canonical-catalog-write";

export async function updateChapterReading(userId: number, comicId: number, chapterId: number, action: "read" | "unread" | "read-through" | "rate", rating?: number | null) {
  if (!Number.isSafeInteger(chapterId) || chapterId <= 0) throw new Error("Invalid chapter");
  return db.transaction(async (tx) => {
    // Serialize registry changes and reading actions against the same chapter set.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SHARED_CATALOG_ADVISORY_LOCK})`);
    const [context] = await tx.select({ slug: comics.slug, status: userComics.status, startedAt: userComics.startedAt })
      .from(userComics).innerJoin(comics, eq(comics.id, userComics.comicId))
      .where(and(eq(userComics.userId, userId), eq(comics.id, comicId),
        or(eq(comics.visibility, "SHARED"), and(eq(comics.visibility, "PRIVATE"), eq(comics.ownerUserId, userId)))))
      .for("update", { of: userComics });
    if (!context) throw new Error("Comic is not in your library");
    const registry = await tx.select().from(chapters).where(eq(chapters.comicId, comicId));
    const target = registry.find((c) => c.id === chapterId);
    if (!target || (action !== "unread" && target.status !== "RELEASED")) throw new Error("Chapter is unavailable");
    if (action === "rate") {
      if (rating !== null && (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5)) throw new Error("Invalid chapter rating");
      const changed = await tx.update(userChapterReads).set({ rating }).where(and(eq(userChapterReads.userId, userId), eq(userChapterReads.chapterId, chapterId))).returning({ id: userChapterReads.chapterId });
      if (!changed.length) throw new Error("Mark chapter read before rating it");
      return context.slug;
    }
    const selected = action === "read-through" ? selectReadThrough(registry, chapterId) : [target];
    const now = new Date();
    if (action === "unread") {
      await tx.delete(userChapterReads).where(and(eq(userChapterReads.userId, userId), eq(userChapterReads.chapterId, chapterId)));
    } else {
      for (let offset = 0; offset < selected.length; offset += 500) {
        await tx.insert(userChapterReads).values(selected.slice(offset, offset + 500).map((c) => ({ userId, chapterId: c.id, readAt: now })))
          .onConflictDoNothing();
      }
    }
    const mainIds = registry.filter((c) => c.status === "RELEASED" && c.kind === "MAIN").map((c) => c.id);
    const count = mainIds.length ? (await tx.select({ id: userChapterReads.chapterId }).from(userChapterReads)
      .where(and(eq(userChapterReads.userId, userId), inArray(userChapterReads.chapterId, mainIds)))).length : 0;
    await tx.update(userComics).set({ currentChapter: count, updatedAt: now,
      status: action !== "unread" && context.status === "WANT_TO_READ" ? "READING" : context.status,
      startedAt: action !== "unread" ? context.startedAt ?? now : context.startedAt,
    }).where(and(eq(userComics.userId, userId), eq(userComics.comicId, comicId)));
    return context.slug;
  });
}
