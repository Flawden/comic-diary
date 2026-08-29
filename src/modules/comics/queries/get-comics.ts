import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { categories, comics } from "@/db/schema";

export async function getComics() {
  return db
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
    .orderBy(asc(comics.title));
}

export type ComicListItem = Awaited<
  ReturnType<typeof getComics>
>[number];
