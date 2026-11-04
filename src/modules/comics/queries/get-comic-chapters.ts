import {
  and,
  asc,
  eq,
  inArray,
} from "drizzle-orm";

import { db } from "@/db";
import { chapters } from "@/db/schema";

export type GetComicChaptersOptions = {
  includeUnreleased?: boolean;
  includeScheduled?: boolean;
};

export async function getComicChapters(
  comicId: number,
  options: GetComicChaptersOptions = {},
) {
  const predicates = [
    eq(
      chapters.comicId,
      comicId,
    ),
  ];

  if (!options.includeUnreleased) {
    predicates.push(
      options.includeScheduled
        ? inArray(chapters.status, ["RELEASED", "SCHEDULED"])
        : eq(chapters.status, "RELEASED"),
    );
  }

  const result = await db
    .select({
      id: chapters.id,
      kind: chapters.kind,
      supersedesChapterId: chapters.supersedesChapterId,
      displayCode:
        chapters.displayCode,
      title:
        chapters.title,
      sourceUrl:
        chapters.sourceUrl,
      sortOrder:
        chapters.sortOrder,
      volumeNumber: chapters.volumeNumber,
      status:
        chapters.status,
      releasedAt:
        chapters.releasedAt,
      expectedRelease: chapters.expectedRelease,
    })
    .from(chapters)
    .where(
      and(
        ...predicates,
      ),
    )
    .orderBy(
      asc(chapters.sortOrder),
      asc(chapters.id),
    );

  // Public chapter lists expose announcements, not unpublished reading links.
  if (options.includeScheduled && !options.includeUnreleased) {
    return result.map((chapter) => chapter.status === "SCHEDULED"
      ? { ...chapter, sourceUrl: null }
      : chapter);
  }
  return result;
}

export type ComicChapter =
  Awaited<
    ReturnType<typeof getComicChapters>
  >[number];
