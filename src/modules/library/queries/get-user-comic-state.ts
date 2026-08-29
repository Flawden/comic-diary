import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { userComics, users } from "@/db/schema";

export async function getUserComicState(
  userEmail: string,
  comicId: number,
) {
  const result = await db
    .select({
      status: userComics.status,
      currentChapter: userComics.currentChapter,
      startedAt: userComics.startedAt,
      completedAt: userComics.completedAt,
    })
    .from(userComics)
    .innerJoin(
      users,
      eq(userComics.userId, users.id),
    )
    .where(
      and(
        eq(users.email, userEmail),
        eq(userComics.comicId, comicId),
      ),
    )
    .limit(1);

  return result[0] ?? null;
}
