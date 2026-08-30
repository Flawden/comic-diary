import "dotenv/config";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { importCatalog } from "../src/catalog/import-catalog";
import {
  categories,
  comics,
  userComics,
  users,
} from "../src/db/schema";

const databaseUrl =
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not defined",
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
});

const db = drizzle(pool);

async function seed() {
  const categorySlug = "tea-territory";
  const comicSlug = "r2-3-test-comic";
  const devUserEmail =
    "reader@comic-diary.local";

  const catalogResult =
    await importCatalog();

  const categoryRows = await db
    .select({
      id: categories.id,
      name: categories.name,
    })
    .from(categories)
    .where(
      eq(
        categories.slug,
        categorySlug,
      ),
    )
    .limit(1);

  const category = categoryRows[0];

  if (!category) {
    throw new Error(
      "Development category does not exist after catalog import",
    );
  }

  const comicRows = await db
    .insert(comics)
    .values({
      slug: comicSlug,
      title: "Тестовый комикс R2.3",
      description:
        "Временная запись для проверки полного пути PostgreSQL → Drizzle → UI.",
      authorName: null,
      translatorName: null,
      translatorNote: null,
      sourceUrl: "https://vk.com/",
      totalChapters: 12,
      publicationStatus: "PUBLISHED",
      categoryId: category.id,
    })
    .onConflictDoUpdate({
      target: comics.slug,
      set: {
        title: "Тестовый комикс R2.3",
        description:
          "Временная запись для проверки полного пути PostgreSQL → Drizzle → UI.",
        authorName: null,
        translatorName: null,
        translatorNote: null,
        sourceUrl: "https://vk.com/",
        totalChapters: 12,
        publicationStatus: "PUBLISHED",
        categoryId: category.id,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: comics.id,
    });

  const comicId = comicRows[0].id;

  const userRows = await db
    .insert(users)
    .values({
      email: devUserEmail,
      displayName:
        "Тестовый читатель",
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        displayName:
          "Тестовый читатель",
        updatedAt: new Date(),
      },
    })
    .returning({
      id: users.id,
    });

  const userId = userRows[0].id;

  await db
    .insert(userComics)
    .values({
      userId,
      comicId,
      status: "READING",
      currentChapter: 3,
      startedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        userComics.userId,
        userComics.comicId,
      ],
      set: {
        status: "READING",
        currentChapter: 3,
        completedAt: null,
        ratingPlot: null,
        ratingCharacters: null,
        ratingArt: null,
        ratingDepth: null,
        ratingWorld: null,
        personalNote: null,
        updatedAt: new Date(),
      },
    });

  console.log("Seed completed.");
  console.log(
    `Catalog: ${catalogResult.categories} categories, ${catalogResult.comics} comics`,
  );
  console.log(
    `Category: ${category.name}`,
  );
  console.log(
    "Comic: Тестовый комикс R2.3",
  );
  console.log(
    "User: Тестовый читатель",
  );
  console.log(
    "Reading state: READING, chapter 3 / 12",
  );
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
