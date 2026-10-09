import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { chapters, comics, userChapterReads, userComics } from "@/db/schema";
import { SHARED_CATALOG_ADVISORY_LOCK } from "@/modules/catalog/canonical-catalog-write";
import { completionSnapshot, isCompletionScope, type CompletionScope } from "../completion-model";

export async function completeComicReading(userId: number, comicId: number, scope: CompletionScope, snapshot: string, mode: "COMPLETE" | "AVAILABLE" = "COMPLETE") {
  if (mode !== "COMPLETE" && mode !== "AVAILABLE") throw new Error("Invalid reading mode");
  if (!isCompletionScope(scope)) throw new Error("Invalid completion scope");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SHARED_CATALOG_ADVISORY_LOCK})`);
    await tx.select({ id: comics.id }).from(comics).where(eq(comics.id, comicId)).for("update");
    const [context] = await tx.select({ slug: comics.slug, total: comics.totalChapters, seriesStatus: comics.seriesStatus, status: userComics.status,
      currentChapter: userComics.currentChapter, startedAt: userComics.startedAt, completedAt: userComics.completedAt })
      .from(userComics).innerJoin(comics, eq(comics.id, userComics.comicId))
      .where(and(eq(userComics.userId, userId), eq(comics.id, comicId),
        or(eq(comics.visibility, "SHARED"), and(eq(comics.visibility, "PRIVATE"), eq(comics.ownerUserId, userId)))))
      .for("update", { of: userComics });
    if (!context) throw new Error("Comic is not in your library");
    const registry = await tx.select().from(chapters).where(eq(chapters.comicId, comicId));
    if (snapshot !== completionSnapshot(registry, context.total, context.seriesStatus)) throw new Error("Chapter list changed; refresh and confirm again");
    if (mode === "COMPLETE" && context.seriesStatus !== "FINISHED") throw new Error("Only finished publications can be completed; mark available chapters instead");
    const registered = registry.length > 0;
    if (mode === "AVAILABLE" && !registered) throw new Error("No chapter registry to mark");
    if (registered ? scope !== "MAIN" && scope !== "ALL" : scope !== "STATUS_ONLY") {
      throw new Error("Completion scope does not match chapter registry");
    }
    if (mode === "COMPLETE" && registered && (registry.some(c => c.kind === "MAIN" && c.status === "SCHEDULED") ||
        !registry.some(c => c.kind === "MAIN" && c.status === "RELEASED"))) throw new Error("Main chapters are not fully released");
    const selected = registry.filter((c) => c.status === "RELEASED" && (scope === "ALL" || c.kind === "MAIN"));
    const now = new Date();
    for (let offset = 0; offset < selected.length; offset += 500) {
      await tx.insert(userChapterReads).values(selected.slice(offset, offset + 500).map((c) => ({ userId, chapterId: c.id, readAt: now })))
        .onConflictDoNothing();
    }
    const mainCount = registry.filter((c) => c.status === "RELEASED" && c.kind === "MAIN").length;
    await tx.update(userComics).set({ status: mode === "COMPLETE" ? "COMPLETED" : "READING", currentChapter: registered ? mainCount : context.currentChapter,
      startedAt: context.startedAt ?? now, completedAt: mode === "COMPLETE" ? context.completedAt ?? now : null, updatedAt: now })
      .where(and(eq(userComics.userId, userId), eq(userComics.comicId, comicId)));
    return context.slug;
  });
}
