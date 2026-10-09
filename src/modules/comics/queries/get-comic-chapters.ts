import {
  and,
  asc,
  eq,
} from "drizzle-orm";

import { db } from "@/db";
import { chapters } from "@/db/schema";

export type GetComicChaptersOptions = {
  includeUnreleased?: boolean;
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
      eq(
        chapters.status,
        "RELEASED",
      ),
    );
  }

  return db
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
      status:
        chapters.status,
      releasedAt:
        chapters.releasedAt,
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
}

export type ComicChapter =
  Awaited<
    ReturnType<typeof getComicChapters>
  >[number];
