import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chapters, userChapterReads } from "@/db/schema";
import { getComicChapters } from "@/modules/comics/queries/get-comic-chapters";
import { summarizeChapterReads } from "../chapter-reading-model";

export async function getChapterReading(userId: number, comicId: number) {
  const [registry, reads] = await Promise.all([
    getComicChapters(comicId, { includeUnreleased: true }),
    db.select({ chapterId: userChapterReads.chapterId, readAt: userChapterReads.readAt })
      .from(userChapterReads).innerJoin(chapters, eq(chapters.id, userChapterReads.chapterId))
      .where(and(eq(userChapterReads.userId, userId), eq(chapters.comicId, comicId))),
  ]);
  return { registry, readIds: reads.map((r) => r.chapterId), registered: registry.length > 0,
    ...summarizeChapterReads(registry, reads) };
}
