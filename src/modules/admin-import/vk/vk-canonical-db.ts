import {
  createHash,
} from "node:crypto";

import {
  and,
  eq,
} from "drizzle-orm";
import {
  drizzle,
} from "drizzle-orm/node-postgres";
import {
  Pool,
} from "pg";

import type {
  CatalogComic,
} from "@/catalog/catalog-data";
import {
  catalogImportReceipts,
  categories,
  comics,
} from "@/db/schema";

import type {
  VkCanonicalImportPlan,
} from "./vk-canonical-import";

export type VkDatabaseAwareImportAction =
  | "create"
  | "update"
  | "unchanged"
  | "imported";

export type VkDatabaseAwareImportPlanItem = {
  candidateId: string;
  albumId: number;
  canonicalSha256: string;
  action: VkDatabaseAwareImportAction;
  receiptRequired: boolean;
  comic: CatalogComic;
};

export type VkDatabaseAwareImportPlan = {
  source: VkCanonicalImportPlan["source"];

  summary: {
    accepted: number;
    create: number;
    update: number;
    unchanged: number;
    imported: number;
  };

  items: VkDatabaseAwareImportPlanItem[];
};

type DatabaseComic = {
  slug: string;
  title: string;
  description: string | null;
  authorName: string | null;
  translatorName: string | null;
  translatorNote: string | null;
  coverUrl: string | null;
  sourceUrl: string;
  totalChapters: number | null;
  publicationStatus:
    CatalogComic["publicationStatus"];
  categorySlug: string | null;
};

function canonicalPayload(
  comic: CatalogComic,
): string {
  return JSON.stringify({
    slug:
      comic.slug,

    title:
      comic.title,

    description:
      comic.description,

    authorName:
      comic.authorName,

    translatorName:
      comic.translatorName,

    translatorNote:
      comic.translatorNote,

    coverUrl:
      comic.coverUrl,

    sourceUrl:
      comic.sourceUrl,

    totalChapters:
      comic.totalChapters,

    publicationStatus:
      comic.publicationStatus,

    categorySlug:
      comic.categorySlug,
  });
}

export function hashVkCanonicalComic(
  comic: CatalogComic,
): string {
  return createHash(
    "sha256",
  )
    .update(
      canonicalPayload(comic),
      "utf8",
    )
    .digest(
      "hex",
    );
}

function databaseComicEqualsCanonical(
  existing: DatabaseComic,
  canonical: CatalogComic,
): boolean {
  return (
    existing.slug ===
      canonical.slug &&
    existing.title ===
      canonical.title &&
    existing.description ===
      canonical.description &&
    existing.authorName ===
      canonical.authorName &&
    existing.translatorName ===
      canonical.translatorName &&
    existing.translatorNote ===
      canonical.translatorNote &&
    existing.coverUrl ===
      canonical.coverUrl &&
    existing.sourceUrl ===
      canonical.sourceUrl &&
    existing.totalChapters ===
      canonical.totalChapters &&
    existing.publicationStatus ===
      canonical.publicationStatus &&
    existing.categorySlug ===
      canonical.categorySlug
  );
}

export async function buildVkDatabaseAwareImportPlan(
  canonicalPlan: VkCanonicalImportPlan,
  databaseUrl: string,
): Promise<VkDatabaseAwareImportPlan> {
  if (databaseUrl.trim() === "") {
    throw new Error(
      "Database URL is required for DB-aware import planning",
    );
  }

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
    const items:
      VkDatabaseAwareImportPlanItem[] =
        [];

    for (
      const item of
      canonicalPlan.items
    ) {
      const canonicalSha256 =
        hashVkCanonicalComic(
          item.comic,
        );

      const existingRows =
        await db
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
        await db
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
        receiptRows.length === 1;

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

      items.push({
        candidateId:
          item.candidateId,

        albumId:
          item.albumId,

        canonicalSha256,

        action,

        receiptRequired:
          action !== "imported",

        comic: {
          ...item.comic,
        },
      });
    }

    return {
      source: {
        ...canonicalPlan.source,
      },

      summary: {
        accepted:
          items.length,

        create:
          items.filter(
            (item) =>
              item.action ===
              "create",
          ).length,

        update:
          items.filter(
            (item) =>
              item.action ===
              "update",
          ).length,

        unchanged:
          items.filter(
            (item) =>
              item.action ===
              "unchanged",
          ).length,

        imported:
          items.filter(
            (item) =>
              item.action ===
              "imported",
          ).length,
      },

      items,
    };
  } finally {
    await pool.end();
  }
}
