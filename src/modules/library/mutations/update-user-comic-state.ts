import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  comics,
  userComics,
  users,
} from "@/db/schema";
import { DEV_USER_EMAIL } from "@/modules/library/dev-user";

export type ReadingStatus =
  typeof userComics.$inferSelect.status;

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

async function getDevUser() {
  const result = await db
    .select({
      id: users.id,
    })
    .from(users)
    .where(
      eq(users.email, DEV_USER_EMAIL),
    )
    .limit(1);

  const user = result[0];

  if (!user) {
    throw new Error(
      "Development user does not exist",
    );
  }

  return user;
}

async function getComic(comicId: number) {
  const result = await db
    .select({
      id: comics.id,
      slug: comics.slug,
      totalChapters: comics.totalChapters,
    })
    .from(comics)
    .where(
      eq(comics.id, comicId),
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

async function getDevUserComicContext(
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
        eq(users.email, DEV_USER_EMAIL),
        eq(userComics.comicId, comicId),
      ),
    )
    .limit(1);

  const context = result[0];

  if (!context) {
    throw new Error(
      "Comic is not in the development user's library",
    );
  }

  return context;
}

export async function addComicToDevUserLibrary(
  comicId: number,
) {
  const user = await getDevUser();
  const comic = await getComic(comicId);

  await db
    .insert(userComics)
    .values({
      userId: user.id,
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

export async function removeComicFromDevUserLibrary(
  comicId: number,
) {
  const user = await getDevUser();
  const comic = await getComic(comicId);

  await db
    .delete(userComics)
    .where(
      and(
        eq(
          userComics.userId,
          user.id,
        ),
        eq(
          userComics.comicId,
          comic.id,
        ),
      ),
    );

  return comic.slug;
}

export async function setDevUserComicStatus(
  comicId: number,
  status: ReadingStatus,
) {
  const context =
    await getDevUserComicContext(
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

export async function changeDevUserComicProgress(
  comicId: number,
  delta: number,
) {
  if (delta !== -1 && delta !== 1) {
    throw new Error(
      "Progress delta must be -1 or 1",
    );
  }

  const context =
    await getDevUserComicContext(
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
