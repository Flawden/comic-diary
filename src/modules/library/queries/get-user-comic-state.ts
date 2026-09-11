import {
  and,
  eq,
  or,
} from "drizzle-orm";

import { db } from "@/db";
import {
  comics,
  userComics,
} from "@/db/schema";

import {
  getChapterProgressCeiling,
} from "@/modules/comics/queries/get-chapter-progress-ceiling";

export async function getUserComicState(
  userId: number,
  comicId: number,
) {
  const result = await db
    .select({
      status:
        userComics.status,

      currentChapter:
        userComics.currentChapter,

      totalChapters:
        comics.totalChapters,

      ratingPlot:
        userComics.ratingPlot,

      ratingCharacters:
        userComics.ratingCharacters,

      ratingArt:
        userComics.ratingArt,

      ratingDepth:
        userComics.ratingDepth,

      ratingWorld:
        userComics.ratingWorld,

      personalNote:
        userComics.personalNote,

      startedAt:
        userComics.startedAt,

      completedAt:
        userComics.completedAt,
    })
    .from(userComics)
    .innerJoin(
      comics,
      eq(
        userComics.comicId,
        comics.id,
      ),
    )
    .where(
      and(
        eq(
          userComics.userId,
          userId,
        ),
        eq(
          userComics.comicId,
          comicId,
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
    .limit(1);

  const state =
    result[0];

  if (!state) {
    return null;
  }

  const progressCeiling =
    await getChapterProgressCeiling(
      comicId,
      state.totalChapters,
    );

  const currentChapter =
    progressCeiling === null
      ? state.currentChapter
      : Math.min(
          state.currentChapter,
          progressCeiling,
        );

  return {
    status:
      state.status,

    currentChapter,

    progressCeiling,

    ratingPlot:
      state.ratingPlot,

    ratingCharacters:
      state.ratingCharacters,

    ratingArt:
      state.ratingArt,

    ratingDepth:
      state.ratingDepth,

    ratingWorld:
      state.ratingWorld,

    personalNote:
      state.personalNote,

    startedAt:
      state.startedAt,

    completedAt:
      state.completedAt,
  };
}
