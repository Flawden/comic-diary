import {
  asc,
  desc,
  eq,
} from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  comics,
  userComics,
  users,
} from "@/db/schema";

export async function getUserLibrary(
  userEmail: string,
) {
  return db
    .select({
      comicId: comics.id,
      slug: comics.slug,
      title: comics.title,
      coverUrl: comics.coverUrl,
      totalChapters: comics.totalChapters,
      categoryName: categories.name,
      status: userComics.status,
      currentChapter: userComics.currentChapter,
      ratingPlot: userComics.ratingPlot,
      ratingCharacters: userComics.ratingCharacters,
      ratingArt: userComics.ratingArt,
      ratingDepth: userComics.ratingDepth,
      ratingWorld: userComics.ratingWorld,
      personalNote: userComics.personalNote,
      updatedAt: userComics.updatedAt,
    })
    .from(userComics)
    .innerJoin(
      users,
      eq(
        userComics.userId,
        users.id,
      ),
    )
    .innerJoin(
      comics,
      eq(
        userComics.comicId,
        comics.id,
      ),
    )
    .leftJoin(
      categories,
      eq(
        comics.categoryId,
        categories.id,
      ),
    )
    .where(
      eq(
        users.email,
        userEmail,
      ),
    )
    .orderBy(
      desc(userComics.updatedAt),
      asc(comics.title),
    );
}

export type UserLibraryItem =
  Awaited<
    ReturnType<typeof getUserLibrary>
  >[number];
