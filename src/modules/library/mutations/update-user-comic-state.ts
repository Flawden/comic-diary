import { and, eq, or } from "drizzle-orm";

import { db } from "@/db";
import {
  comics,
  userComics,
  users,
} from "@/db/schema";
import type { PersonalRatings } from "@/modules/library/ratings/calculate-average-rating";

export type ReadingStatus =
  typeof userComics.$inferSelect.status;

export type PersonalDiaryInput =
  PersonalRatings & {
    personalNote: string | null;
  };

const readingStatuses: ReadingStatus[] = [
  "WANT_TO_READ",
  "READING",
  "COMPLETED",
  "ON_HOLD",
];

export function isReadingStatus(
  value: string,
): value is ReadingStatus {
  return readingStatuses.includes(
    value as ReadingStatus,
  );
}

async function getComic(
  userId: number,
  comicId: number,
) {
  const result = await db
    .select({
      id: comics.id,
      slug: comics.slug,
      totalChapters: comics.totalChapters,
      visibility: comics.visibility,
      ownerUserId: comics.ownerUserId,
    })
    .from(comics)
    .where(
      and(
        eq(
          comics.id,
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

  const comic = result[0];

  if (!comic) {
    throw new Error(
      "Comic does not exist",
    );
  }

  return comic;
}

async function getUserComicContext(
  userId: number,
  comicId: number,
) {
  const result = await db
    .select({
      userId: users.id,
      comicId: comics.id,
      slug: comics.slug,
      totalChapters: comics.totalChapters,
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
    .innerJoin(
      comics,
      eq(userComics.comicId, comics.id),
    )
    .where(
      and(
        eq(userComics.userId, userId),
        eq(userComics.comicId, comicId),
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

  const context = result[0];

  if (!context) {
    throw new Error(
      "Comic is not in the authenticated user's library",
    );
  }

  return context;
}

export async function addComicToUserLibrary(
  userId: number,
  comicId: number,
) {
  const comic = await getComic(
    userId,
    comicId,
  );

  await db
    .insert(userComics)
    .values({
      userId: userId,
      comicId: comic.id,
      status: "WANT_TO_READ",
      currentChapter: 0,
    })
    .onConflictDoNothing({
      target: [
        userComics.userId,
        userComics.comicId,
      ],
    });

  return comic.slug;
}

export async function removeComicFromUserLibrary(
  userId: number,
  comicId: number,
) {
  const comic = await getComic(
    userId,
    comicId,
  );

  await db
    .delete(userComics)
    .where(
      and(
        eq(
          userComics.userId,
          userId,
        ),
        eq(
          userComics.comicId,
          comic.id,
        ),
      ),
    );

  return comic.slug;
}

export async function setUserComicStatus(
  userId: number,
  comicId: number,
  status: ReadingStatus,
) {
  const context =
    await getUserComicContext(
      userId,
      comicId,
    );

  const now = new Date();

  const values: Partial<
    typeof userComics.$inferInsert
  > = {
    status,
    updatedAt: now,
  };

  if (status === "READING") {
    values.completedAt = null;

    if (!context.startedAt) {
      values.startedAt = now;
    }
  }

  if (status === "COMPLETED") {
    values.completedAt = now;

    if (!context.startedAt) {
      values.startedAt = now;
    }

    if (context.totalChapters !== null) {
      values.currentChapter =
        context.totalChapters;
    }
  }

  if (
    status === "WANT_TO_READ" ||
    status === "ON_HOLD"
  ) {
    values.completedAt = null;
  }

  await db
    .update(userComics)
    .set(values)
    .where(
      and(
        eq(
          userComics.userId,
          context.userId,
        ),
        eq(
          userComics.comicId,
          comicId,
        ),
      ),
    );

  return context.slug;
}

export async function changeUserComicProgress(
  userId: number,
  comicId: number,
  delta: number,
) {
  if (delta !== -1 && delta !== 1) {
    throw new Error(
      "Progress delta must be -1 or 1",
    );
  }

  const context =
    await getUserComicContext(
      userId,
      comicId,
    );

  let nextChapter =
    context.currentChapter + delta;

  nextChapter = Math.max(
    0,
    nextChapter,
  );

  if (context.totalChapters !== null) {
    nextChapter = Math.min(
      nextChapter,
      context.totalChapters,
    );
  }

  const now = new Date();

  let nextStatus = context.status;
  let startedAt = context.startedAt;
  let completedAt = context.completedAt;

  if (
    nextChapter > 0 &&
    nextStatus === "WANT_TO_READ"
  ) {
    nextStatus = "READING";
    startedAt ??= now;
  }

  if (
    context.totalChapters !== null &&
    nextChapter >=
      context.totalChapters
  ) {
    nextStatus = "COMPLETED";
    completedAt = now;
    startedAt ??= now;
  } else if (
    nextStatus === "COMPLETED"
  ) {
    nextStatus = "READING";
    completedAt = null;
  }

  await db
    .update(userComics)
    .set({
      currentChapter: nextChapter,
      status: nextStatus,
      startedAt,
      completedAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(
          userComics.userId,
          context.userId,
        ),
        eq(
          userComics.comicId,
          comicId,
        ),
      ),
    );

  return context.slug;
}

export async function updateUserComicDiary(
  userId: number,
  comicId: number,
  diary: PersonalDiaryInput,
) {
  const context =
    await getUserComicContext(
      userId,
      comicId,
    );

  const ratingValues = [
    diary.ratingPlot,
    diary.ratingCharacters,
    diary.ratingArt,
    diary.ratingDepth,
    diary.ratingWorld,
  ];

  for (const rating of ratingValues) {
    if (
      rating !== null &&
      (
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      )
    ) {
      throw new Error(
        "Rating must be null or an integer from 1 to 5",
      );
    }
  }

  await db
    .update(userComics)
    .set({
      ratingPlot: diary.ratingPlot,
      ratingCharacters: diary.ratingCharacters,
      ratingArt: diary.ratingArt,
      ratingDepth: diary.ratingDepth,
      ratingWorld: diary.ratingWorld,
      personalNote: diary.personalNote,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(
          userComics.userId,
          context.userId,
        ),
        eq(
          userComics.comicId,
          comicId,
        ),
      ),
    );

  return context.slug;
}
