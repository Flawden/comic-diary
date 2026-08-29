import { eq } from "drizzle-orm";

import { db } from "@/db";
import { categories, comics } from "@/db/schema";

export async function getComicBySlug(slug: string) {
  const result = await db
    .select({
      id: comics.id,
      slug: comics.slug,
      title: comics.title,
      description: comics.description,
      coverUrl: comics.coverUrl,
      sourceUrl: comics.sourceUrl,
      totalChapters: comics.totalChapters,
      categoryId: categories.id,
      categoryName: categories.name,
    })
    .from(comics)
    .leftJoin(
      categories,
      eq(comics.categoryId, categories.id),
    )
    .where(eq(comics.slug, slug))
    .limit(1);

  return result[0] ?? null;
}

export type ComicDetails = NonNullable<
  Awaited<ReturnType<typeof getComicBySlug>>
>;
