import {
  and,
  eq,
  sql,
} from "drizzle-orm";

import type {
  CatalogCategory,
  CatalogComic,
} from "@/catalog/catalog-data";
import {
  validateCatalogData,
} from "@/catalog/validate-catalog";

import {
  db,
} from "@/db";
import {
  administrativeAuditEvents,
  categories,
  comics,
} from "@/db/schema";

import type {
  UserRole,
} from "@/modules/auth/permissions";

import {
  canonicalCategoryCreateValues,
  canonicalCategoryUpdateValues,
  canonicalComicCreateValues,
  canonicalComicUpdateValues,
  SHARED_CATALOG_ADVISORY_LOCK,
} from "./canonical-catalog-write";

export type SharedCatalogAuditActor = {
  userId: number;
  role: UserRole;
};

export type SharedCatalogMutationErrorKind =
  | "invalid-catalog"
  | "category-already-exists"
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

function validateCanonicalCategory(
  category: CatalogCategory,
) {
  try {
    validateCatalogData(
      [
        category,
      ],
      [],
    );
  } catch {
    throw new SharedCatalogMutationError(
      "invalid-catalog",
    );
  }
}

export async function createSharedCatalogCategory(
  category: CatalogCategory,
  actor: SharedCatalogAuditActor,
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

      validateCanonicalCategory(
        category,
      );

      const inserted =
        await tx
          .insert(
            categories,
          )
          .values(
            canonicalCategoryCreateValues(
              category,
            ),
          )
          .onConflictDoNothing({
            target:
              categories.slug,
          })
          .returning({
            id:
              categories.id,

            slug:
              categories.slug,
          });

      if (
        inserted.length !==
        1
      ) {
        throw new SharedCatalogMutationError(
          "category-already-exists",
        );
      }

      const created =
        inserted[0];

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
            "CATEGORY_CREATE",
          targetType:
            "CATEGORY",
          targetId:
            created.id,
          targetKey:
            created.slug,
          details: {
            channel:
              "manual",
          },
        });

      return created;
    },
  );
}

export async function updateSharedCatalogCategory(
  category: CatalogCategory,
  actor: SharedCatalogAuditActor,
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

      validateCanonicalCategory(
        category,
      );

      const updated =
        await tx
          .update(
            categories,
          )
          .set(
            canonicalCategoryUpdateValues(
              category,
            ),
          )
          .where(
            eq(
              categories.slug,
              category.slug,
            ),
          )
          .returning({
            id:
              categories.id,

            slug:
              categories.slug,
          });

      if (
        updated.length !==
        1
      ) {
        throw new SharedCatalogMutationError(
          "category-not-found",
        );
      }

      const result =
        updated[0];

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
            "CATEGORY_UPDATE",
          targetType:
            "CATEGORY",
          targetId:
            result.id,
          targetKey:
            result.slug,
          details: {
            channel:
              "manual",
          },
        });

      return result;
    },
  );
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
  actor: SharedCatalogAuditActor,
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

      const created =
        inserted[0];

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
            "COMIC_CREATE",
          targetType:
            "COMIC",
          targetId:
            created.id,
          targetKey:
            created.slug,
          details: {
            channel:
              "manual",
            categorySlug:
              comic.categorySlug,
            publicationStatus:
              comic.publicationStatus,
          },
        });

      return created;
    },
  );
}

export async function updateSharedCatalogComic(
  comic: CatalogComic,
  actor: SharedCatalogAuditActor,
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
            and(
              eq(
                comics.slug,
                comic.slug,
              ),
              eq(
                comics.visibility,
                "SHARED",
              ),
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

      const result =
        updated[0];

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
            "COMIC_UPDATE",
          targetType:
            "COMIC",
          targetId:
            result.id,
          targetKey:
            result.slug,
          details: {
            channel:
              "manual",
            categorySlug:
              comic.categorySlug,
            publicationStatus:
              comic.publicationStatus,
          },
        });

      return result;
    },
  );
}
