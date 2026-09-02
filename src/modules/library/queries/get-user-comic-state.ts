import {
  and,
  eq,
} from "drizzle-orm";

import { db } from "@/db";
import { userComics } from "@/db/schema";

export async function getUserComicState(
  userId: number,
  comicId: number,
) {
  const result = await db
    .select({
      status: userComics.status,
      currentChapter: userComics.currentChapter,
      ratingPlot: userComics.ratingPlot,
      ratingCharacters: userComics.ratingCharacters,
      ratingArt: userComics.ratingArt,
      ratingDepth: userComics.ratingDepth,
      ratingWorld: userComics.ratingWorld,
      personalNote: userComics.personalNote,
      startedAt: userComics.startedAt,
      completedAt: userComics.completedAt,
    })
    .from(userComics)
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
      ),
    )
    .limit(1);

  return result[0] ?? null;
}
