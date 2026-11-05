import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { chapters, comics, userChapterReads, userComics } from "@/db/schema";
import { selectReadThrough, unreadEarlierMainChapters } from "../chapter-reading-model";
import { SHARED_CATALOG_ADVISORY_LOCK } from "@/modules/catalog/canonical-catalog-write";

type Action = "read" | "unread" | "read-through" | "rate" | "undo-bulk";

async function mutateChapterReading(userId: number, comicId: number, chapterId: number, action: Action, rating?: number | null, undoIds: number[] = [], previewPrevious = false) {
  if (action === "undo-bulk") {
    if (undoIds.length === 0 || undoIds.length > 2000 || new Set(undoIds).size !== undoIds.length ||
      undoIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error("Invalid undo selection");
  }
  if (action !== "undo-bulk" && (!Number.isSafeInteger(chapterId) || chapterId <= 0)) throw new Error("Invalid chapter");
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
    if (action !== "undo-bulk" && (!target || (action !== "unread" && target.status !== "RELEASED"))) throw new Error("Chapter is unavailable");
    // The Updates feed is paginated and contains only unread chapters. Determine
    // earlier gaps from the authoritative complete registry and the reader's
    // existing marks, in the SAME transaction as the chosen read.
    let missingEarlier: { id: number; displayCode: string; title: string | null }[] = [];
    if (previewPrevious && action === "read" && target?.kind === "MAIN") {
      const readRows = await tx.select({ chapterId: userChapterReads.chapterId }).from(userChapterReads)
        .where(and(eq(userChapterReads.userId, userId), inArray(userChapterReads.chapterId, registry.map(c => c.id))));
      missingEarlier = unreadEarlierMainChapters(registry, readRows.map(row => row.chapterId), chapterId)
        .map(({ id, displayCode, title }) => ({ id, displayCode, title }));
    }
    if (action === "rate") {
      if (rating !== null && (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5)) throw new Error("Invalid chapter rating");
      const changed = await tx.update(userChapterReads).set({ rating }).where(and(eq(userChapterReads.userId, userId), eq(userChapterReads.chapterId, chapterId))).returning({ id: userChapterReads.chapterId });
      if (!changed.length) throw new Error("Mark chapter read before rating it");
      return { slug: context.slug, addedIds: [] as number[], missingEarlier: [] as { id: number; displayCode: string; title: string | null }[] };
    }
    if (action === "undo-bulk") {
      if (!undoIds.every((id) => registry.some((chapter) => chapter.id === id && chapter.kind === "MAIN" && chapter.status === "RELEASED")))
        throw new Error("Some chapters are no longer available; refresh before undoing");
      const current = await tx.select({ id: userChapterReads.chapterId, rating: userChapterReads.rating }).from(userChapterReads)
        .where(and(eq(userChapterReads.userId, userId), inArray(userChapterReads.chapterId, undoIds)));
      if (current.some((row) => row.rating !== null)) throw new Error("Cannot undo chapters that have since been rated");
      await tx.delete(userChapterReads).where(and(eq(userChapterReads.userId, userId), inArray(userChapterReads.chapterId, undoIds)));
    }
    const selected = action === "read-through" ? selectReadThrough(registry, chapterId) : target ? [target] : [];
    const now = new Date();
    const addedIds: number[] = [];
    if (action === "unread") {
      await tx.delete(userChapterReads).where(and(eq(userChapterReads.userId, userId), eq(userChapterReads.chapterId, chapterId)));
    } else if (action !== "undo-bulk") {
      for (let offset = 0; offset < selected.length; offset += 500) {
        const rows = await tx.insert(userChapterReads).values(selected.slice(offset, offset + 500).map((c) => ({ userId, chapterId: c.id, readAt: now })))
          .onConflictDoNothing().returning({ id: userChapterReads.chapterId });
        addedIds.push(...rows.map((row) => row.id));
      }
    }
    const mainIds = registry.filter((c) => c.status === "RELEASED" && c.kind === "MAIN").map((c) => c.id);
    const count = mainIds.length ? (await tx.select({ id: userChapterReads.chapterId }).from(userChapterReads)
      .where(and(eq(userChapterReads.userId, userId), inArray(userChapterReads.chapterId, mainIds)))).length : 0;
    await tx.update(userComics).set({ currentChapter: count, updatedAt: now,
      status: action !== "unread" && action !== "undo-bulk" && context.status === "WANT_TO_READ" ? "READING" : context.status,
      startedAt: action !== "unread" && action !== "undo-bulk" ? context.startedAt ?? now : context.startedAt,
    }).where(and(eq(userComics.userId, userId), eq(userComics.comicId, comicId)));
    // Don't prompt if this was already marked by another request/device.
    if (!addedIds.includes(chapterId)) missingEarlier = [];
    return { slug: context.slug, addedIds, missingEarlier };
  });
}

export async function updateChapterReading(userId: number, comicId: number, chapterId: number,
  action: "read" | "unread" | "read-through" | "rate", rating?: number | null) {
  return (await mutateChapterReading(userId, comicId, chapterId, action, rating)).slug;
}

// Mark a single chapter and return the earlier unread MAIN chapters visible to
// this reader before the insertion, regardless of Updates pagination or filter.
export async function readChapterWithPreviousPreview(userId: number, comicId: number, chapterId: number) {
  return mutateChapterReading(userId, comicId, chapterId, "read", undefined, [], true);
}

// One transaction: only newly inserted IDs are returned, so undo never removes older marks.
export async function markPreviousChaptersRead(userId: number, comicId: number, chapterId: number) {
  return mutateChapterReading(userId, comicId, chapterId, "read-through");
}

export async function undoPreviousChapterMarks(userId: number, comicId: number, chapterIds: number[]) {
  return (await mutateChapterReading(userId, comicId, 0, "undo-bulk", undefined, chapterIds)).slug;
}

export async function rateChaptersBatch(userId: number, comicId: number, values: { id: number; rating: number }[]) {
  if (!values.length || values.length > 500 || new Set(values.map((row) => row.id)).size !== values.length ||
      values.some(({ id, rating }) => !Number.isSafeInteger(id) || id <= 0 || !Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new Error("Invalid chapter ratings");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SHARED_CATALOG_ADVISORY_LOCK})`);
    const [context] = await tx.select({ slug: comics.slug }).from(userComics)
      .innerJoin(comics, eq(comics.id, userComics.comicId))
      .where(and(eq(userComics.userId, userId), eq(comics.id, comicId),
        or(eq(comics.visibility, "SHARED"), and(eq(comics.visibility, "PRIVATE"), eq(comics.ownerUserId, userId)))))
      .for("update", { of: userComics });
    if (!context) throw new Error("Comic is not in your library");
    const available = await tx.select({ id: chapters.id }).from(chapters)
      .where(and(eq(chapters.comicId, comicId), eq(chapters.kind, "MAIN"), eq(chapters.status, "RELEASED"), inArray(chapters.id, values.map(({ id }) => id))));
    if (available.length !== values.length) throw new Error("Chapter is unavailable");
    for (const { id, rating } of values) {
      const changed = await tx.update(userChapterReads).set({ rating })
        .where(and(eq(userChapterReads.userId, userId), eq(userChapterReads.chapterId, id)))
        .returning({ id: userChapterReads.chapterId });
      if (!changed.length) throw new Error("Chapter must be read before it can be rated");
    }
    return context.slug;
  });
}
