import {
  eq,
  sql,
} from "drizzle-orm";

import type {
  CatalogComic,
} from "@/catalog/catalog-data";
import {
  validateCatalogData,
} from "@/catalog/validate-catalog";

import {
  db,
} from "@/db";
import {
  categories,
  comics,
} from "@/db/schema";

import {
  canonicalComicCreateValues,
  canonicalComicUpdateValues,
  SHARED_CATALOG_ADVISORY_LOCK,
} from "./canonical-catalog-write";

export type SharedCatalogMutationErrorKind =
  | "invalid-catalog"
  | "category-not-found"
  | "comic-already-exists"
  | "comic-not-found";

export class SharedCatalogMutationError
  extends Error {
  constructor(
    readonly kind:
      SharedCatalogMutationErrorKind,
  ) {
    super(
      `Shared catalog mutation failed: ${kind}`,
    );

    this.name =
      "SharedCatalogMutationError";
  }
}

async function validateCanonicalComic(
  tx: Parameters<
    Parameters<
      typeof db.transaction
    >[0]
  >[0],
  comic: CatalogComic,
) {
  const rows =
    await tx
      .select({
        slug:
          categories.slug,

        name:
          categories.name,

        description:
          categories.description,
      })
      .from(
        categories,
      )
      .where(
        eq(
          categories.slug,
          comic.categorySlug,
        ),
      )
      .limit(
        1,
      );

  const category =
    rows[0];

  if (!category) {
    throw new SharedCatalogMutationError(
      "category-not-found",
    );
  }

  try {
    validateCatalogData(
      [
        {
          slug:
            category.slug,

          name:
            category.name,

          description:
            category.description,
        },
      ],
      [
        comic,
      ],
    );
  } catch {
    throw new SharedCatalogMutationError(
      "invalid-catalog",
    );
  }

  return category;
}

export async function createSharedCatalogComic(
  comic: CatalogComic,
) {
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

      const category =
        await validateCanonicalComic(
          tx,
          comic,
        );

      const categoryRows =
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
              category.slug,
            ),
          )
          .limit(
            1,
          );

      const categoryId =
        categoryRows[0]?.id;

      if (!categoryId) {
        throw new SharedCatalogMutationError(
          "category-not-found",
        );
      }

      const inserted =
        await tx
          .insert(
            comics,
          )
          .values(
            canonicalComicCreateValues(
              comic,
              categoryId,
            ),
          )
          .onConflictDoNothing({
            target:
              comics.slug,
          })
          .returning({
            id:
              comics.id,

            slug:
              comics.slug,
          });

      if (
        inserted.length !==
        1
      ) {
        throw new SharedCatalogMutationError(
          "comic-already-exists",
        );
      }

      return inserted[0];
    },
  );
}

export async function updateSharedCatalogComic(
  comic: CatalogComic,
) {
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

      const category =
        await validateCanonicalComic(
          tx,
          comic,
        );

      const categoryRows =
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
              category.slug,
            ),
          )
          .limit(
            1,
          );

      const categoryId =
        categoryRows[0]?.id;

      if (!categoryId) {
        throw new SharedCatalogMutationError(
          "category-not-found",
        );
      }

      const updated =
        await tx
          .update(
            comics,
          )
          .set(
            canonicalComicUpdateValues(
              comic,
              categoryId,
            ),
          )
          .where(
            eq(
              comics.slug,
              comic.slug,
            ),
          )
          .returning({
            id:
              comics.id,

            slug:
              comics.slug,
          });

      if (
        updated.length !==
        1
      ) {
        throw new SharedCatalogMutationError(
          "comic-not-found",
        );
      }

      return updated[0];
    },
  );
}
