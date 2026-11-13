import { createHash } from "node:crypto";
import { isCoverFilename } from "@/modules/media/cover-storage";
import { parseChapterBatch } from "./chapter-batch-input";
import { parseStructuredChapterBatch } from "./chapter-structured-batch";
import { planVolumeChapterPlacement } from "./chapter-placement";
import { isValidExpectedRelease } from "./chapter-release-dates";
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
  kind?: "MAIN" | "SPECIAL";
  displayCode: string;
  title: string | null;
  sourceUrl: string | null;
  coverUrl?: string | null;
  status:
    | "SCHEDULED"
    | "RELEASED";
  releasedAt: Date | null;
  expectedRelease?: string | null;
  volumeNumber?: number | null;
};

export type SharedChapterCreateInput =
  SharedChapterMetadataInput & {
    sortOrder: number;
    supersedesChapterId?: number | null;
  };

export type SharedChapterMutationErrorKind =
  | "invalid-chapter"
  | "comic-not-found"
  | "chapter-not-found"
  | "chapter-archived"
  | "chapter-display-code-conflict"
  | "chapter-batch-stale"
  | "chapter-order-stale";

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

function normalizeChapterCoverUrl(value: string | null | undefined) {
  if (value === undefined) return undefined; // Legacy updates preserve the artwork.
  if (value === null || value.trim() === "") return null;
  const candidate = value.trim();
  const matched = /^\/media\/covers\/([^/]+)$/.exec(candidate);
  if (!matched || !isCoverFilename(matched[1])) {
    throw new SharedChapterMutationError("invalid-chapter");
  }
  return candidate;
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
  if (input.kind !== undefined && input.kind !== "MAIN" && input.kind !== "SPECIAL") {
    throw new SharedChapterMutationError("invalid-chapter");
  }
  const displayCode =
    input.displayCode.trim();

  if (
    (!displayCode && !input.title?.trim()) ||
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
  if (input.volumeNumber !== undefined && input.volumeNumber !== null &&
      (!Number.isSafeInteger(input.volumeNumber) || input.volumeNumber < 1 || input.volumeNumber > 99)) {
    throw new SharedChapterMutationError("invalid-chapter");
  }

  const expectedRelease = input.expectedRelease === undefined ? undefined
    : input.expectedRelease === null || input.expectedRelease.trim() === "" ? null
    : input.expectedRelease.trim();
  if (expectedRelease !== undefined && expectedRelease !== null && !isValidExpectedRelease(expectedRelease)) {
    throw new SharedChapterMutationError("invalid-chapter");
  }

  // An expected date is not proof of release. Never auto-publish by date.
  if (
    input.status === "SCHEDULED" &&
    releasedAt !== null
  ) {
    throw new SharedChapterMutationError(
      "invalid-chapter",
    );
  }

  if (input.status === "RELEASED" && expectedRelease !== undefined && expectedRelease !== null) {
    throw new SharedChapterMutationError("invalid-chapter");
  }

  return {
    ...(input.kind === undefined ? {} : { kind: input.kind }),
    ...(input.volumeNumber === undefined ? {} : { volumeNumber: input.volumeNumber }),
    // Publish transitions clear old plans. Other callers may omit the new field.
    expectedRelease: input.status === "RELEASED" ? null : expectedRelease,
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

    ...(input.coverUrl === undefined ? {} : {
      coverUrl: normalizeChapterCoverUrl(input.coverUrl),
    }),

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
    kind: chapter.kind,
    volumeNumber: chapter.volumeNumber,
    supersedesChapterId: chapter.supersedesChapterId,
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

    coverUrl: chapter.coverUrl,

    sortOrder:
      chapter.sortOrder,

    status:
      chapter.status,

    releasedAt:
      chapter.releasedAt
        ?.toISOString() ??
      null,
    expectedRelease: chapter.expectedRelease,
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

        const supersedesChapterId = input.supersedesChapterId ?? null;
        let replaced: ChapterRow | null = null;
        if (supersedesChapterId !== null) {
          requirePositiveId(supersedesChapterId);
          const [previous] = await tx.select().from(chapters)
            .where(and(eq(chapters.id, supersedesChapterId), eq(chapters.comicId, comic.id)));
          if (!previous || previous.status !== "RELEASED" || metadata.status !== "RELEASED" ||
              previous.kind !== (metadata.kind ?? "MAIN")) {
            throw new SharedChapterMutationError("invalid-chapter");
          }
          replaced = previous;
          await tx.update(chapters).set({ status: "ARCHIVED", updatedAt: new Date() })
            .where(eq(chapters.id, previous.id));
          await tx.insert(administrativeAuditEvents).values({
            actorUserId: actor.userId, actorRole: actor.role, action: "CHAPTER_ARCHIVE",
            targetType: "CHAPTER", targetId: previous.id,
            targetKey: chapterTargetKey(comic.slug, previous.id),
            details: { channel: "manual-revision", before: chapterSnapshot(previous) },
          });
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
              volumeNumber: metadata.volumeNumber === undefined ? replaced?.volumeNumber ?? null : metadata.volumeNumber,
              supersedesChapterId,
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

              replaces: replaced ? chapterSnapshot(replaced) : null,
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


/** Preview and atomic append share the same validation and catalog lock. */
export async function appendSharedChapterBatch(
  comicId: number,
  text: string,
  status: "SCHEDULED" | "RELEASED",
  actor: SharedChapterAuditActor,
  expectedSnapshot?: string,
) {
  requirePositiveId(comicId);
  if (status !== "SCHEDULED" && status !== "RELEASED") throw new SharedChapterMutationError("invalid-chapter");
  const rows = parseChapterBatch(text).map(row => normalizeMetadata({ ...row, status, releasedAt: null }));
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SHARED_CATALOG_ADVISORY_LOCK})`);
    const [comic] = await tx.select({ id: comics.id, slug: comics.slug }).from(comics)
      .where(and(eq(comics.id, comicId), eq(comics.visibility, "SHARED")));
    if (!comic) throw new SharedChapterMutationError("comic-not-found");
    const registry = await tx.select().from(chapters).where(eq(chapters.comicId, comicId));
    registry.sort((a, b) => a.id - b.id);
    const snapshot = createHash("sha256").update(JSON.stringify({ comicId, rows, registry: registry.map(chapterSnapshot) })).digest("hex");
    if (expectedSnapshot !== undefined && expectedSnapshot !== snapshot) throw new SharedChapterMutationError("chapter-batch-stale");
    const codes = new Set(registry.filter(row => row.status !== "ARCHIVED").map(row => row.displayCode));
    if (rows.some(row => row.displayCode && codes.has(row.displayCode))) throw new SharedChapterMutationError("chapter-display-code-conflict");
    const lastOrder = registry.reduce((max, row) => Math.max(max, row.sortOrder), 0);
    if (lastOrder + rows.length * 10 > 2147483647) throw new SharedChapterMutationError("invalid-chapter");
    const values = rows.map((row, index) => ({ ...row, comicId, sortOrder: lastOrder + (index + 1) * 10 }));
    if (expectedSnapshot === undefined) return { snapshot, rows: values, createdCount: 0 };
    const created = await tx.insert(chapters).values(values).returning();
    await tx.insert(administrativeAuditEvents).values(created.map(chapter => ({
      actorUserId: actor.userId, actorRole: actor.role, action: "CHAPTER_CREATE" as const,
      targetType: "CHAPTER" as const, targetId: chapter.id, targetKey: chapterTargetKey(comic.slug, chapter.id),
      details: { channel: "manual-batch", comicId, comicSlug: comic.slug, after: chapterSnapshot(chapter) },
    })));
    return { snapshot, rows: values, createdCount: created.length };
  });
}


/** Advanced multi-row create/revision: one authorization, one lock, one transaction.
 * Existing reading records remain attached to their historical chapter IDs.
 */
export async function appendSharedChapterStructuredBatch(
  comicId: number,
  input: unknown,
  actor: SharedChapterAuditActor,
  expectedSnapshot?: string,
) {
  requirePositiveId(comicId);
  const rawRows = parseStructuredChapterBatch(input);
  const rows = rawRows.map(row => ({
    ...row,
    metadata: normalizeMetadata({
      kind: row.kind, displayCode: row.displayCode, title: row.title,
      sourceUrl: row.sourceUrl, status: row.status,
      releasedAt: row.releasedAt ? new Date(row.releasedAt) : null,
      expectedRelease: row.expectedRelease, volumeNumber: row.volumeNumber,
    }),
  }));
  try {
    return await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${SHARED_CATALOG_ADVISORY_LOCK})`);
      const [comic] = await tx.select({ id: comics.id, slug: comics.slug }).from(comics)
        .where(and(eq(comics.id, comicId), eq(comics.visibility, "SHARED")));
      if (!comic) throw new SharedChapterMutationError("comic-not-found");
      const registry = await tx.select().from(chapters).where(eq(chapters.comicId, comicId));
      registry.sort((a, b) => a.id - b.id);
      const snapshot = createHash("sha256").update(JSON.stringify({
        comicId, rows: rawRows, registry: registry.map(chapterSnapshot),
      })).digest("hex");
      if (expectedSnapshot !== undefined && expectedSnapshot !== snapshot)
        throw new SharedChapterMutationError("chapter-batch-stale");
      const active = registry.filter(row => row.status !== "ARCHIVED");
      const used = new Map(active.filter(row => row.displayCode).map(row => [row.displayCode, row.id]));
      const prepared = rows.map(row => {
        const old = row.supersedesChapterId === null ? null
          : registry.find(chapter => chapter.id === row.supersedesChapterId);
        if (row.supersedesChapterId !== null &&
            (!old || old.status !== "RELEASED" || row.status !== "RELEASED" || old.kind !== row.kind))
          throw new SharedChapterMutationError("invalid-chapter");
        const ownerId = used.get(row.displayCode);
        if (row.displayCode && ownerId !== undefined && ownerId !== old?.id)
          throw new SharedChapterMutationError("chapter-display-code-conflict");
        return {
          metadata: { ...row.metadata, volumeNumber: row.volumeNumber },
          supersedesChapterId: row.supersedesChapterId, old,
          placementMode: row.placementMode, anchorChapterId: row.anchorChapterId,
        };
      });
      // Plan against the complete active registry while the catalog lock is held.
      // Reading IDs are untouched; archive replacements before inserting new rows.
      let placement: ReturnType<typeof planVolumeChapterPlacement>;
      try {
        placement = planVolumeChapterPlacement(active.map(chapter => ({
          id: chapter.id, volumeNumber: chapter.volumeNumber, sortOrder: chapter.sortOrder,
        })), prepared.map(row => ({
          volumeNumber: row.metadata.volumeNumber ?? null,
          supersedesChapterId: row.supersedesChapterId,
          placementMode: row.placementMode,
          anchorChapterId: row.anchorChapterId,
        })));
      } catch {
        throw new SharedChapterMutationError("invalid-chapter");
      }
      const ordered = prepared.map((row, index) => ({ ...row, sortOrder: placement.newSortOrders[index] }));
      const previewRows = ordered.map(row => ({
        ...row.metadata, releasedAt: row.metadata.releasedAt?.toISOString() ?? null,
        sortOrder: row.sortOrder, supersedesChapterId: row.supersedesChapterId,
      }));
      if (expectedSnapshot === undefined) return { snapshot, rows: previewRows, createdCount: 0 };
      // All validations completed before mutations. A failure below rolls back the entire batch.
      const now = new Date();
      for (const change of placement.existingChanges) {
        const before = active.find(chapter => chapter.id === change.id)!;
        const [after] = await tx.update(chapters).set({ sortOrder: change.sortOrder, updatedAt: now })
          .where(eq(chapters.id, before.id)).returning();
        await tx.insert(administrativeAuditEvents).values({
          actorUserId: actor.userId, actorRole: actor.role, action: "CHAPTER_REORDER",
          targetType: "CHAPTER", targetId: before.id,
          targetKey: chapterTargetKey(comic.slug, before.id),
          details: { channel: "structured-batch-placement", before: chapterSnapshot(before), after: chapterSnapshot(after) },
        });
      }
      const created = [] as ChapterRow[];
      for (const row of ordered) {
        if (row.old) {
          await tx.update(chapters).set({ status: "ARCHIVED", updatedAt: new Date() })
            .where(eq(chapters.id, row.old.id));
          await tx.insert(administrativeAuditEvents).values({
            actorUserId: actor.userId, actorRole: actor.role, action: "CHAPTER_ARCHIVE",
            targetType: "CHAPTER", targetId: row.old.id,
            targetKey: chapterTargetKey(comic.slug, row.old.id),
            details: { channel: "structured-batch-revision", before: chapterSnapshot(row.old) },
          });
        }
        const [chapter] = await tx.insert(chapters).values({
          ...row.metadata, comicId, sortOrder: row.sortOrder,
          supersedesChapterId: row.supersedesChapterId,
        }).returning();
        if (!chapter) throw new Error("Chapter insert returned no row");
        created.push(chapter);
        await tx.insert(administrativeAuditEvents).values({
          actorUserId: actor.userId, actorRole: actor.role, action: "CHAPTER_CREATE",
          targetType: "CHAPTER", targetId: chapter.id,
          targetKey: chapterTargetKey(comic.slug, chapter.id),
          details: { channel: "structured-batch", comicId, comicSlug: comic.slug,
            replaces: row.old ? chapterSnapshot(row.old) : null, after: chapterSnapshot(chapter) },
        });
      }
      return { snapshot, rows: previewRows, createdCount: created.length };
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new SharedChapterMutationError("chapter-display-code-conflict");
    throw error;
  }
}

/** Move within the complete active registry; IDs and reading history remain unchanged. */
export async function moveSharedCatalogChapter(
  comicId: number, chapterId: number, direction: "up" | "down",
  expected: { sortOrder: number; neighborId: number; neighborSortOrder: number },
  actor: SharedChapterAuditActor,
) {
  requirePositiveId(comicId); requirePositiveId(chapterId); requirePositiveId(expected.neighborId);
  normalizeSortOrder(expected.sortOrder); normalizeSortOrder(expected.neighborSortOrder);
  if (direction !== "up" && direction !== "down") throw new SharedChapterMutationError("invalid-chapter");
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SHARED_CATALOG_ADVISORY_LOCK})`);
    const [comic] = await tx.select().from(comics).where(and(eq(comics.id, comicId), eq(comics.visibility, "SHARED")));
    if (!comic) throw new SharedChapterMutationError("comic-not-found");
    const registry = await tx.select().from(chapters).where(eq(chapters.comicId, comicId));
    const current = registry.find(c => c.id === chapterId);
    if (!current) throw new SharedChapterMutationError("chapter-not-found");
    if (current.status === "ARCHIVED") throw new SharedChapterMutationError("chapter-archived");
    const active = registry.filter(c => c.status !== "ARCHIVED" && c.volumeNumber === current.volumeNumber)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    const index = active.findIndex(c => c.id === chapterId);
    const neighborIndex = index + (direction === "up" ? -1 : 1);
    const neighbor = active[neighborIndex];
    if (!neighbor || neighbor.id !== expected.neighborId || current.sortOrder !== expected.sortOrder || neighbor.sortOrder !== expected.neighborSortOrder)
      throw new SharedChapterMutationError("chapter-order-stale");
    [active[index], active[neighborIndex]] = [active[neighborIndex], active[index]];
    // Unique ascending values make a move deterministic even when old values tie.
    // Preserve existing slots when strictly increasing; otherwise normalize active slots.
    const slots = active.map(c => c.sortOrder).sort((a, b) => a - b);
    const unique = slots.every((value, i) => i === 0 || value > slots[i - 1]);
    const now = new Date();
    for (const [i, before] of active.entries()) {
      const sortOrder = unique ? slots[i] : (i + 1) * 10;
      if (sortOrder === before.sortOrder) continue;
      const [after] = await tx.update(chapters).set({ sortOrder, updatedAt: now }).where(eq(chapters.id, before.id)).returning();
      await tx.insert(administrativeAuditEvents).values({
        actorUserId: actor.userId, actorRole: actor.role, action: "CHAPTER_REORDER", targetType: "CHAPTER", targetId: before.id,
        targetKey: chapterTargetKey(comic.slug, before.id),
        details: { channel: "adjacent-move", comicId, direction, movedChapterId: chapterId, before: chapterSnapshot(before), after: chapterSnapshot(after) },
      });
    }
    return { chapterId, neighborId: neighbor.id };
  });
}
