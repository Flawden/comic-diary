import {
  and,
  eq,
  sql,
} from "drizzle-orm";

import {
  db,
} from "@/db";

import {
  administrativeAuditEvents,
  chapters,
  comics,
} from "@/db/schema";

import type {
  UserRole,
} from "@/modules/auth/permissions";

import {
  SHARED_CATALOG_ADVISORY_LOCK,
} from "./canonical-catalog-write";

export type SharedChapterAuditActor = {
  userId: number;
  role: UserRole;
};

type ChapterRow =
  typeof chapters.$inferSelect;

type ChapterInsert =
  typeof chapters.$inferInsert;

export type SharedChapterStatus =
  NonNullable<
    ChapterInsert["status"]
  >;

export type SharedChapterMetadataInput = {
  displayCode: string;
  title: string | null;
  sourceUrl: string | null;
  status:
    | "SCHEDULED"
    | "RELEASED";
  releasedAt: Date | null;
};

export type SharedChapterCreateInput =
  SharedChapterMetadataInput & {
    sortOrder: number;
  };

export type SharedChapterMutationErrorKind =
  | "invalid-chapter"
  | "comic-not-found"
  | "chapter-not-found"
  | "chapter-archived"
  | "chapter-display-code-conflict";

export class SharedChapterMutationError
  extends Error {
  constructor(
    readonly kind:
      SharedChapterMutationErrorKind,
  ) {
    super(
      `Shared chapter mutation failed: ${kind}`,
    );

    this.name =
      "SharedChapterMutationError";
  }
}

function requirePositiveId(
  value: number,
) {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <= 0
  ) {
    throw new SharedChapterMutationError(
      "invalid-chapter",
    );
  }

  return value;
}

function normalizeNullableText(
  value: string | null,
  maxLength?: number,
) {
  if (value === null) {
    return null;
  }

  const trimmed =
    value.trim();

  if (trimmed === "") {
    return null;
  }

  if (
    maxLength !== undefined &&
    trimmed.length > maxLength
  ) {
    throw new SharedChapterMutationError(
      "invalid-chapter",
    );
  }

  return trimmed;
}

function normalizeSourceUrl(
  value: string | null,
) {
  const normalized =
    normalizeNullableText(
      value,
    );

  if (normalized === null) {
    return null;
  }

  let parsed: URL;

  try {
    parsed =
      new URL(
        normalized,
      );
  } catch {
    throw new SharedChapterMutationError(
      "invalid-chapter",
    );
  }

  if (
    parsed.protocol !== "http:" &&
    parsed.protocol !== "https:"
  ) {
    throw new SharedChapterMutationError(
      "invalid-chapter",
    );
  }

  return normalized;
}

function normalizeReleasedAt(
  value: Date | null,
) {
  if (value === null) {
    return null;
  }

  if (
    !(value instanceof Date) ||
    Number.isNaN(
      value.getTime(),
    )
  ) {
    throw new SharedChapterMutationError(
      "invalid-chapter",
    );
  }

  return value;
}

function normalizeMetadata(
  input: SharedChapterMetadataInput,
) {
  const displayCode =
    input.displayCode.trim();

  if (
    displayCode === "" ||
    displayCode.length > 160
  ) {
    throw new SharedChapterMutationError(
      "invalid-chapter",
    );
  }

  if (
    input.status !== "SCHEDULED" &&
    input.status !== "RELEASED"
  ) {
    throw new SharedChapterMutationError(
      "invalid-chapter",
    );
  }

  const releasedAt =
    normalizeReleasedAt(
      input.releasedAt,
    );

  /*
   * releasedAt records an actual release fact.
   * Expected future release dates belong to a
   * separate later scheduling/reminder model.
   */
  if (
    input.status === "SCHEDULED" &&
    releasedAt !== null
  ) {
    throw new SharedChapterMutationError(
      "invalid-chapter",
    );
  }

  return {
    displayCode,

    title:
      normalizeNullableText(
        input.title,
        255,
      ),

    sourceUrl:
      normalizeSourceUrl(
        input.sourceUrl,
      ),

    status:
      input.status,

    releasedAt,
  };
}

function normalizeSortOrder(
  value: number,
) {
  if (
    !Number.isSafeInteger(
      value,
    )
  ) {
    throw new SharedChapterMutationError(
      "invalid-chapter",
    );
  }

  return value;
}

function chapterSnapshot(
  chapter: ChapterRow,
) {
  return {
    id:
      chapter.id,

    comicId:
      chapter.comicId,

    displayCode:
      chapter.displayCode,

    title:
      chapter.title,

    sourceUrl:
      chapter.sourceUrl,

    sortOrder:
      chapter.sortOrder,

    status:
      chapter.status,

    releasedAt:
      chapter.releasedAt
        ?.toISOString() ??
      null,
  };
}

function chapterTargetKey(
  comicSlug: string,
  chapterId: number,
) {
  return `${comicSlug}:chapter:${chapterId}`;
}

function isUniqueViolation(
  error: unknown,
) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (
      error as {
        code?: unknown;
      }
    ).code === "23505"
  );
}

export async function createSharedCatalogChapter(
  comicId: number,
  input: SharedChapterCreateInput,
  actor: SharedChapterAuditActor,
) {
  requirePositiveId(
    comicId,
  );

  const metadata =
    normalizeMetadata(
      input,
    );

  const sortOrder =
    normalizeSortOrder(
      input.sortOrder,
    );

  try {
    return await db.transaction(
      async (
        tx,
      ) => {
        await tx.execute(
          sql`
            SELECT pg_advisory_xact_lock(
              ${SHARED_CATALOG_ADVISORY_LOCK}
            )
          `,
        );

        const comicRows =
          await tx
            .select({
              id:
                comics.id,
              slug:
                comics.slug,
            })
            .from(
              comics,
            )
            .where(
              and(
                eq(
                  comics.id,
                  comicId,
                ),
                eq(
                  comics.visibility,
                  "SHARED",
                ),
              ),
            )
            .limit(
              1,
            );

        const comic =
          comicRows[0];

        if (!comic) {
          throw new SharedChapterMutationError(
            "comic-not-found",
          );
        }

        const inserted =
          await tx
            .insert(
              chapters,
            )
            .values({
              comicId:
                comic.id,

              ...metadata,

              sortOrder,
            })
            .returning();

        const created =
          inserted[0];

        if (!created) {
          throw new Error(
            "Chapter insert returned no row",
          );
        }

        await tx
          .insert(
            administrativeAuditEvents,
          )
          .values({
            actorUserId:
              actor.userId,

            actorRole:
              actor.role,

            action:
              "CHAPTER_CREATE",

            targetType:
              "CHAPTER",

            targetId:
              created.id,

            targetKey:
              chapterTargetKey(
                comic.slug,
                created.id,
              ),

            details: {
              channel:
                "manual",

              comicId:
                comic.id,

              comicSlug:
                comic.slug,

              after:
                chapterSnapshot(
                  created,
                ),
            },
          });

        return created;
      },
    );
  } catch (error) {
    if (
      isUniqueViolation(
        error,
      )
    ) {
      throw new SharedChapterMutationError(
        "chapter-display-code-conflict",
      );
    }

    throw error;
  }
}

export async function updateSharedCatalogChapter(
  comicId: number,
  chapterId: number,
  input: SharedChapterMetadataInput,
  actor: SharedChapterAuditActor,
) {
  requirePositiveId(
    comicId,
  );

  requirePositiveId(
    chapterId,
  );

  const metadata =
    normalizeMetadata(
      input,
    );

  try {
    return await db.transaction(
      async (
        tx,
      ) => {
        await tx.execute(
          sql`
            SELECT pg_advisory_xact_lock(
              ${SHARED_CATALOG_ADVISORY_LOCK}
            )
          `,
        );

        const comicRows =
          await tx
            .select({
              id:
                comics.id,
              slug:
                comics.slug,
            })
            .from(
              comics,
            )
            .where(
              and(
                eq(
                  comics.id,
                  comicId,
                ),
                eq(
                  comics.visibility,
                  "SHARED",
                ),
              ),
            )
            .limit(
              1,
            );

        const comic =
          comicRows[0];

        if (!comic) {
          throw new SharedChapterMutationError(
            "comic-not-found",
          );
        }

        const beforeRows =
          await tx
            .select()
            .from(
              chapters,
            )
            .where(
              and(
                eq(
                  chapters.id,
                  chapterId,
                ),
                eq(
                  chapters.comicId,
                  comic.id,
                ),
              ),
            )
            .limit(
              1,
            );

        const before =
          beforeRows[0];

        if (!before) {
          throw new SharedChapterMutationError(
            "chapter-not-found",
          );
        }

        if (
          before.status ===
          "ARCHIVED"
        ) {
          throw new SharedChapterMutationError(
            "chapter-archived",
          );
        }

        const updatedRows =
          await tx
            .update(
              chapters,
            )
            .set({
              ...metadata,

              updatedAt:
                new Date(),
            })
            .where(
              eq(
                chapters.id,
                before.id,
              ),
            )
            .returning();

        const updated =
          updatedRows[0];

        if (!updated) {
          throw new Error(
            "Chapter update returned no row",
          );
        }

        await tx
          .insert(
            administrativeAuditEvents,
          )
          .values({
            actorUserId:
              actor.userId,

            actorRole:
              actor.role,

            action:
              "CHAPTER_UPDATE",

            targetType:
              "CHAPTER",

            targetId:
              updated.id,

            targetKey:
              chapterTargetKey(
                comic.slug,
                updated.id,
              ),

            details: {
              channel:
                "manual",

              comicId:
                comic.id,

              comicSlug:
                comic.slug,

              before:
                chapterSnapshot(
                  before,
                ),

              after:
                chapterSnapshot(
                  updated,
                ),
            },
          });

        return updated;
      },
    );
  } catch (error) {
    if (
      isUniqueViolation(
        error,
      )
    ) {
      throw new SharedChapterMutationError(
        "chapter-display-code-conflict",
      );
    }

    throw error;
  }
}

export async function reorderSharedCatalogChapter(
  comicId: number,
  chapterId: number,
  sortOrder: number,
  actor: SharedChapterAuditActor,
) {
  requirePositiveId(
    comicId,
  );

  requirePositiveId(
    chapterId,
  );

  const normalizedSortOrder =
    normalizeSortOrder(
      sortOrder,
    );

  return db.transaction(
    async (
      tx,
    ) => {
      await tx.execute(
        sql`
          SELECT pg_advisory_xact_lock(
            ${SHARED_CATALOG_ADVISORY_LOCK}
          )
        `,
      );

      const comicRows =
        await tx
          .select({
            id:
              comics.id,
            slug:
              comics.slug,
          })
          .from(
            comics,
          )
          .where(
            and(
              eq(
                comics.id,
                comicId,
              ),
              eq(
                comics.visibility,
                "SHARED",
              ),
            ),
          )
          .limit(
            1,
          );

      const comic =
        comicRows[0];

      if (!comic) {
        throw new SharedChapterMutationError(
          "comic-not-found",
        );
      }

      const beforeRows =
        await tx
          .select()
          .from(
            chapters,
          )
          .where(
            and(
              eq(
                chapters.id,
                chapterId,
              ),
              eq(
                chapters.comicId,
                comic.id,
              ),
            ),
          )
          .limit(
            1,
          );

      const before =
        beforeRows[0];

      if (!before) {
        throw new SharedChapterMutationError(
          "chapter-not-found",
        );
      }

      if (
        before.status ===
        "ARCHIVED"
      ) {
        throw new SharedChapterMutationError(
          "chapter-archived",
        );
      }

      const updatedRows =
        await tx
          .update(
            chapters,
          )
          .set({
            sortOrder:
              normalizedSortOrder,

            updatedAt:
              new Date(),
          })
          .where(
            eq(
              chapters.id,
              before.id,
            ),
          )
          .returning();

      const updated =
        updatedRows[0];

      if (!updated) {
        throw new Error(
          "Chapter reorder returned no row",
        );
      }

      await tx
        .insert(
          administrativeAuditEvents,
        )
        .values({
          actorUserId:
            actor.userId,

          actorRole:
            actor.role,

          action:
            "CHAPTER_REORDER",

          targetType:
            "CHAPTER",

          targetId:
            updated.id,

          targetKey:
            chapterTargetKey(
              comic.slug,
              updated.id,
            ),

          details: {
            channel:
              "manual",

            comicId:
              comic.id,

            comicSlug:
              comic.slug,

            before:
              chapterSnapshot(
                before,
              ),

            after:
              chapterSnapshot(
                updated,
              ),
          },
        });

      return updated;
    },
  );
}

export async function archiveSharedCatalogChapter(
  comicId: number,
  chapterId: number,
  actor: SharedChapterAuditActor,
) {
  requirePositiveId(
    comicId,
  );

  requirePositiveId(
    chapterId,
  );

  return db.transaction(
    async (
      tx,
    ) => {
      await tx.execute(
        sql`
          SELECT pg_advisory_xact_lock(
            ${SHARED_CATALOG_ADVISORY_LOCK}
          )
        `,
      );

      const comicRows =
        await tx
          .select({
            id:
              comics.id,
            slug:
              comics.slug,
          })
          .from(
            comics,
          )
          .where(
            and(
              eq(
                comics.id,
                comicId,
              ),
              eq(
                comics.visibility,
                "SHARED",
              ),
            ),
          )
          .limit(
            1,
          );

      const comic =
        comicRows[0];

      if (!comic) {
        throw new SharedChapterMutationError(
          "comic-not-found",
        );
      }

      const beforeRows =
        await tx
          .select()
          .from(
            chapters,
          )
          .where(
            and(
              eq(
                chapters.id,
                chapterId,
              ),
              eq(
                chapters.comicId,
                comic.id,
              ),
            ),
          )
          .limit(
            1,
          );

      const before =
        beforeRows[0];

      if (!before) {
        throw new SharedChapterMutationError(
          "chapter-not-found",
        );
      }

      if (
        before.status ===
        "ARCHIVED"
      ) {
        throw new SharedChapterMutationError(
          "chapter-archived",
        );
      }

      const updatedRows =
        await tx
          .update(
            chapters,
          )
          .set({
            status:
              "ARCHIVED",

            updatedAt:
              new Date(),
          })
          .where(
            eq(
              chapters.id,
              before.id,
            ),
          )
          .returning();

      const updated =
        updatedRows[0];

      if (!updated) {
        throw new Error(
          "Chapter archive returned no row",
        );
      }

      await tx
        .insert(
          administrativeAuditEvents,
        )
        .values({
          actorUserId:
            actor.userId,

          actorRole:
            actor.role,

          action:
            "CHAPTER_ARCHIVE",

          targetType:
            "CHAPTER",

          targetId:
            updated.id,

          targetKey:
            chapterTargetKey(
              comic.slug,
              updated.id,
            ),

          details: {
            channel:
              "manual",

            comicId:
              comic.id,

            comicSlug:
              comic.slug,

            before:
              chapterSnapshot(
                before,
              ),

            after:
              chapterSnapshot(
                updated,
              ),
          },
        });

      return updated;
    },
  );
}
