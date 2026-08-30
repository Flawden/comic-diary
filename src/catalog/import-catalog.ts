import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  catalogCategories,
  catalogComics,
} from "@/catalog/catalog-data";
import { validateCatalogData } from "@/catalog/validate-catalog";
import {
  categories,
  comics,
} from "@/db/schema";

export type CatalogImportResult = {
  categories: number;
  comics: number;
};

export async function importCatalog(): Promise<CatalogImportResult> {
  const databaseUrl =
    process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not defined",
    );
  }

  validateCatalogData(
    catalogCategories,
    catalogComics,
  );

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  const db = drizzle(pool);

  try {
    const categoryIds =
      new Map<string, number>();

    for (
      const category of
      catalogCategories
    ) {
      const rows = await db
        .insert(categories)
        .values({
          slug: category.slug,
          name: category.name,
          description:
            category.description,
        })
        .onConflictDoUpdate({
          target: categories.slug,
          set: {
            name: category.name,
            description:
              category.description,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: categories.id,
        });

      categoryIds.set(
        category.slug,
        rows[0].id,
      );
    }

    for (const comic of catalogComics) {
      const categoryId =
        categoryIds.get(
          comic.categorySlug,
        );

      if (!categoryId) {
        throw new Error(
          `Category was not imported: ${comic.categorySlug}`,
        );
      }

      await db
        .insert(comics)
        .values({
          slug: comic.slug,
          title: comic.title,
          description: comic.description,
          coverUrl: comic.coverUrl,
          sourceUrl: comic.sourceUrl,
          totalChapters:
            comic.totalChapters,
          categoryId,
        })
        .onConflictDoUpdate({
          target: comics.slug,
          set: {
            title: comic.title,
            description:
              comic.description,
            coverUrl: comic.coverUrl,
            sourceUrl: comic.sourceUrl,
            totalChapters:
              comic.totalChapters,
            categoryId,
            updatedAt: new Date(),
          },
        });
    }

    return {
      categories:
        catalogCategories.length,
      comics: catalogComics.length,
    };
  } finally {
    await pool.end();
  }
}
