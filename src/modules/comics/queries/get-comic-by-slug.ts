import {
  and,
  eq,
  or,
} from "drizzle-orm";

import { db } from "@/db";
import { categories, comics } from "@/db/schema";

export async function getComicBySlug(
  slug: string,
  viewerUserId: number | null = null,
) {
  const visibilityPredicate =
    viewerUserId === null
      ? eq(
          comics.visibility,
          "SHARED",
        )
      : or(
          eq(
            comics.visibility,
            "SHARED",
          ),
          and(
            eq(
              comics.visibility,
              "PRIVATE",
            ),
            eq(
              comics.ownerUserId,
              viewerUserId,
            ),
          ),
        );

  const result = await db
    .select({
      id: comics.id,
      slug: comics.slug,
      title: comics.title,
      description: comics.description,
      authorName: comics.authorName,
      translatorName: comics.translatorName,
      translatorNote: comics.translatorNote,
      coverUrl: comics.coverUrl,
      bannerUrl: comics.bannerUrl,
      sourceUrl: comics.sourceUrl,
      seriesStatus: comics.seriesStatus,
      workType: comics.workType,
      workFormat: comics.workFormat,
      totalChapters: comics.totalChapters,
      publicationStatus:
        comics.publicationStatus,
      visibility: comics.visibility,
      ownerUserId: comics.ownerUserId,
      categoryId: categories.id,
      categoryName: categories.name,
    })
    .from(comics)
    .leftJoin(
      categories,
      eq(comics.categoryId, categories.id),
    )
    .where(
      and(
        eq(comics.slug, slug),
        visibilityPredicate,
      ),
    )
    .limit(1);

  return result[0] ?? null;
}

export type ComicDetails = NonNullable<
  Awaited<ReturnType<typeof getComicBySlug>>
>;
