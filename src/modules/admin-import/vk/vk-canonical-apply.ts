import {
  and,
  eq,
  sql,
} from "drizzle-orm";
import {
  drizzle,
} from "drizzle-orm/node-postgres";
import {
  Pool,
} from "pg";

import type {
  CatalogCategory,
} from "@/catalog/catalog-data";
import { validateCatalogData } from "@/catalog/validate-catalog";
import {
  catalogImportReceipts,
  categories,
  comics,
} from "@/db/schema";

import type {
  VkCanonicalImportPlan,
} from "./vk-canonical-import";
import {
  databaseComicEqualsCanonical,
  hashVkCanonicalComic,
} from "./vk-canonical-db";
import type {
  VkDatabaseAwareImportAction,
} from "./vk-canonical-db";

/*
 * One process-wide PostgreSQL advisory transaction
 * lock serializes Comic Diary catalog imports.
 *
 * This closes the gap between "fresh DB decision"
 * and the subsequent catalog mutation.
 */
const VK_CATALOG_IMPORT_ADVISORY_LOCK =
  536000001;

export type VkCanonicalApplyItemResult = {
  candidateId: string;
  albumId: number;
  comicSlug: string;
  canonicalSha256: string;
  action: VkDatabaseAwareImportAction;
  receiptInserted: boolean;
};

export type VkCanonicalApplyResult = {
  source:
    VkCanonicalImportPlan["source"];

  summary: {
    accepted: number;
    create: number;
    update: number;
    unchanged: number;
    imported: number;
    receiptsInserted: number;
  };

  items:
    VkCanonicalApplyItemResult[];
};

function assertSha256(
  value: string,
  label: string,
) {
  if (
    !/^[0-9a-f]{64}$/.test(
      value,
    )
  ) {
    throw new Error(
      `${label} must be a lowercase SHA-256 hex string`,
    );
  }
}

function validateApplyInput(
  canonicalPlan: VkCanonicalImportPlan,
  catalogCategories: readonly CatalogCategory[],
) {
  assertSha256(
    canonicalPlan.source
      .candidateSha256,
    "candidateSha256",
  );

  assertSha256(
    canonicalPlan.source
      .snapshotSha256,
    "snapshotSha256",
  );

  if (
    !Number.isInteger(
      canonicalPlan.source
        .communityId,
    ) ||
    canonicalPlan.source
      .communityId <= 0
  ) {
    throw new Error(
      "communityId must be a positive integer",
    );
  }

  const candidateIds =
    new Set<string>();

  for (
    const item of
    canonicalPlan.items
  ) {
    if (
      item.candidateId.trim() === ""
    ) {
      throw new Error(
        "Canonical import item has an empty candidateId",
      );
    }

    if (
      candidateIds.has(
        item.candidateId,
      )
    ) {
      throw new Error(
        `Duplicate canonical candidateId: ${item.candidateId}`,
      );
    }

    candidateIds.add(
      item.candidateId,
    );

    if (
      !Number.isInteger(
        item.albumId,
      )
    ) {
      throw new Error(
        `Invalid albumId for ${item.candidateId}`,
      );
    }
  }

  /*
   * Revalidate the complete batch immediately
   * before opening the write transaction.
   */
  validateCatalogData(
    catalogCategories,
    canonicalPlan.items.map(
      (item) =>
        item.comic,
    ),
  );
}

export async function applyVkCanonicalImportPlan(
  canonicalPlan: VkCanonicalImportPlan,
  catalogCategories: readonly CatalogCategory[],
  databaseUrl: string,
): Promise<VkCanonicalApplyResult> {
  if (
    databaseUrl.trim() === ""
  ) {
    throw new Error(
      "Database URL is required for canonical apply",
    );
  }

  validateApplyInput(
    canonicalPlan,
    catalogCategories,
  );

  const pool =
    new Pool({
      connectionString:
        databaseUrl,
    });

  const db =
    drizzle(
      pool,
    );

  try {
    return await db.transaction(
      async (
        tx,
      ): Promise<VkCanonicalApplyResult> => {
        /*
         * All Comic Diary canonical applies using
         * this boundary are serialized.
         *
         * Lock lifetime equals transaction lifetime.
         */
        await tx.execute(
          sql`
            SELECT pg_advisory_xact_lock(
              ${VK_CATALOG_IMPORT_ADVISORY_LOCK}
            )
          `,
        );

        /*
         * Resolve all referenced categories from
         * PostgreSQL inside the same transaction.
         *
         * R5.3.6C does not create or delete
         * categories implicitly.
         */
        const categoryIds =
          new Map<string, number>();

        const requiredCategorySlugs =
          [
            ...new Set(
              canonicalPlan.items.map(
                (item) =>
                  item.comic.categorySlug,
              ),
            ),
          ];

        for (
          const categorySlug of
          requiredCategorySlugs
        ) {
          const rows =
            await tx
              .select({
                id:
                  categories.id,
              })
              .from(
                categories,
              )
              .where(
                eq(
                  categories.slug,
                  categorySlug,
                ),
              )
              .limit(
                1,
              );

          const category =
            rows[0];

          if (!category) {
            throw new Error(
              `Canonical category does not exist in PostgreSQL: ${categorySlug}`,
            );
          }

          categoryIds.set(
            categorySlug,
            category.id,
          );
        }

        const result:
          VkCanonicalApplyResult = {
          source: {
            ...canonicalPlan.source,
          },

          summary: {
            accepted:
              canonicalPlan.items.length,

            create:
              0,

            update:
              0,

            unchanged:
              0,

            imported:
              0,

            receiptsInserted:
              0,
          },

          items:
            [],
        };

        for (
          const item of
          canonicalPlan.items
        ) {
          const categoryId =
            categoryIds.get(
              item.comic.categorySlug,
            );

          if (!categoryId) {
            throw new Error(
              `Resolved category disappeared: ${item.comic.categorySlug}`,
            );
          }

          const canonicalSha256 =
            hashVkCanonicalComic(
              item.comic,
            );

          /*
           * Fresh database comparison happens
           * inside the transaction after taking
           * the catalog advisory lock.
           */
          const existingRows =
            await tx
              .select({
                slug:
                  comics.slug,

                title:
                  comics.title,

                description:
                  comics.description,

                authorName:
                  comics.authorName,

                translatorName:
                  comics.translatorName,

                translatorNote:
                  comics.translatorNote,

                coverUrl:
                  comics.coverUrl,

                sourceUrl:
                  comics.sourceUrl,

                totalChapters:
                  comics.totalChapters,

                publicationStatus:
                  comics.publicationStatus,

                categorySlug:
                  categories.slug,
              })
              .from(
                comics,
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
                  comics.slug,
                  item.comic.slug,
                ),
              )
              .limit(
                1,
              );

          const existing =
            existingRows[0] ??
            null;

          const receiptRows =
            await tx
              .select({
                id:
                  catalogImportReceipts.id,
              })
              .from(
                catalogImportReceipts,
              )
              .where(
                and(
                  eq(
                    catalogImportReceipts
                      .candidateSha256,
                    canonicalPlan.source
                      .candidateSha256,
                  ),

                  eq(
                    catalogImportReceipts
                      .candidateId,
                    item.candidateId,
                  ),

                  eq(
                    catalogImportReceipts
                      .canonicalSha256,
                    canonicalSha256,
                  ),
                ),
              )
              .limit(
                1,
              );

          const hasMatchingReceipt =
            receiptRows.length ===
            1;

          let action:
            VkDatabaseAwareImportAction;

          if (!existing) {
            action =
              "create";
          } else if (
            !databaseComicEqualsCanonical(
              existing,
              item.comic,
            )
          ) {
            action =
              "update";
          } else if (
            hasMatchingReceipt
          ) {
            action =
              "imported";
          } else {
            action =
              "unchanged";
          }

          if (
            action ===
            "create"
          ) {
            const inserted =
              await tx
                .insert(
                  comics,
                )
                .values({
                  slug:
                    item.comic.slug,

                  title:
                    item.comic.title,

                  description:
                    item.comic.description,

                  authorName:
                    item.comic.authorName,

                  translatorName:
                    item.comic.translatorName,

                  translatorNote:
                    item.comic.translatorNote,

                  coverUrl:
                    item.comic.coverUrl,

                  sourceUrl:
                    item.comic.sourceUrl,

                  totalChapters:
                    item.comic.totalChapters,

                  publicationStatus:
                    item.comic.publicationStatus,

                  categoryId,
                })
                .returning({
                  id:
                    comics.id,
                });

            if (
              inserted.length !==
              1
            ) {
              throw new Error(
                `Comic create failed: ${item.comic.slug}`,
              );
            }

            result.summary.create +=
              1;
          } else if (
            action ===
            "update"
          ) {
            const updated =
              await tx
                .update(
                  comics,
                )
                .set({
                  title:
                    item.comic.title,

                  description:
                    item.comic.description,

                  authorName:
                    item.comic.authorName,

                  translatorName:
                    item.comic.translatorName,

                  translatorNote:
                    item.comic.translatorNote,

                  coverUrl:
                    item.comic.coverUrl,

                  sourceUrl:
                    item.comic.sourceUrl,

                  totalChapters:
                    item.comic.totalChapters,

                  publicationStatus:
                    item.comic.publicationStatus,

                  categoryId,

                  updatedAt:
                    new Date(),
                })
                .where(
                  eq(
                    comics.slug,
                    item.comic.slug,
                  ),
                )
                .returning({
                  id:
                    comics.id,
                });

            if (
              updated.length !==
              1
            ) {
              throw new Error(
                `Comic update failed: ${item.comic.slug}`,
              );
            }

            result.summary.update +=
              1;
          } else if (
            action ===
            "unchanged"
          ) {
            result.summary.unchanged +=
              1;
          } else {
            result.summary.imported +=
              1;
          }

          let receiptInserted =
            false;

          if (
            action !==
            "imported"
          ) {
            const receiptInsert =
              await tx
                .insert(
                  catalogImportReceipts,
                )
                .values({
                  candidateSha256:
                    canonicalPlan.source
                      .candidateSha256,

                  snapshotSha256:
                    canonicalPlan.source
                      .snapshotSha256,

                  communityId:
                    canonicalPlan.source
                      .communityId,

                  candidateId:
                    item.candidateId,

                  albumId:
                    item.albumId,

                  comicSlug:
                    item.comic.slug,

                  canonicalSha256,

                  appliedAction:
                    action,
                })
                .onConflictDoNothing()
                .returning({
                  id:
                    catalogImportReceipts.id,
                });

            receiptInserted =
              receiptInsert.length ===
              1;

            if (
              receiptInserted
            ) {
              result.summary
                .receiptsInserted +=
                1;
            }
          }

          result.items.push({
            candidateId:
              item.candidateId,

            albumId:
              item.albumId,

            comicSlug:
              item.comic.slug,

            canonicalSha256,

            action,

            receiptInserted,
          });
        }

        return result;
      },
    );
  } finally {
    await pool.end();
  }
}
