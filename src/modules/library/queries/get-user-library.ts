import {
  and,
  asc,
  desc,
  eq,
  or,
} from "drizzle-orm";

import { db } from "@/db";
import {
  getChapterProgressCeiling,
} from "@/modules/comics/queries/get-chapter-progress-ceiling";

import {
  categories,
  comics,
  userComics,
  users,
} from "@/db/schema";

export async function getUserLibrary(
  userId: number,
) {
  const rows = await db
    .select({
      comicId: comics.id,
      slug: comics.slug,
      title: comics.title,
      coverUrl: comics.coverUrl,
      totalChapters: comics.totalChapters,
      categoryName: categories.name,
      visibility: comics.visibility,
      ownerUserId: comics.ownerUserId,
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
      and(
        eq(
          userComics.userId,
          userId,
        ),
        or(
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
              userId,
            ),
          ),
        ),
      ),
    )
    .orderBy(
      desc(userComics.updatedAt),
      asc(comics.title),
    );

  return Promise.all(
    rows.map(
      async (item) => {
        const progressCeiling =
          await getChapterProgressCeiling(
            item.comicId,
            item.totalChapters,
          );

        const currentChapter =
          progressCeiling === null
            ? item.currentChapter
            : Math.min(
                item.currentChapter,
                progressCeiling,
              );

        return {
          ...item,
          currentChapter,
          progressCeiling,
        };
      },
    ),
  );
}

export type UserLibraryItem =
  Awaited<
    ReturnType<typeof getUserLibrary>
  >[number];
