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

  return result[0] ?? null;
}
