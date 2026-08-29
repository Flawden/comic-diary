import "dotenv/config";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { categories, comics } from "../src/db/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined");
}

const pool = new Pool({
  connectionString: databaseUrl,
});

const db = drizzle(pool);

async function seed() {
  const categoryName = "Чайная территория";

  const existingCategory = await db
    .select()
    .from(categories)
    .where(eq(categories.name, categoryName))
    .limit(1);

  let categoryId = existingCategory[0]?.id;

  if (!categoryId) {
    const insertedCategories = await db
      .insert(categories)
      .values({
        name: categoryName,
        description: "Основная территория каталога комиксов",
      })
      .returning({
        id: categories.id,
      });

    categoryId = insertedCategories[0].id;
  }

  await db
    .insert(comics)
    .values({
      slug: "r2-3-test-comic",
      title: "Тестовый комикс R2.3",
      description:
        "Временная запись для проверки полного пути PostgreSQL → Drizzle → UI.",
      sourceUrl: "https://vk.com/",
      totalChapters: 1,
      categoryId,
    })
    .onConflictDoUpdate({
      target: comics.slug,
      set: {
        title: "Тестовый комикс R2.3",
        description:
          "Временная запись для проверки полного пути PostgreSQL → Drizzle → UI.",
        sourceUrl: "https://vk.com/",
        totalChapters: 1,
        categoryId,
        updatedAt: new Date(),
      },
    });

  console.log("Seed completed.");
  console.log(`Category: ${categoryName}`);
  console.log("Comic: Тестовый комикс R2.3");
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
