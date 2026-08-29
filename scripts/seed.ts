import "dotenv/config";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  categories,
  comics,
  userComics,
  users,
} from "../src/db/schema";

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
  const comicSlug = "r2-3-test-comic";
  const devUserEmail = "reader@comic-diary.local";

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

  const comicRows = await db
    .insert(comics)
    .values({
      slug: comicSlug,
      title: "Тестовый комикс R2.3",
      description:
        "Временная запись для проверки полного пути PostgreSQL → Drizzle → UI.",
      sourceUrl: "https://vk.com/",
      totalChapters: 12,
      categoryId,
    })
    .onConflictDoUpdate({
      target: comics.slug,
      set: {
        title: "Тестовый комикс R2.3",
        description:
          "Временная запись для проверки полного пути PostgreSQL → Drizzle → UI.",
        sourceUrl: "https://vk.com/",
        totalChapters: 12,
        categoryId,
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
      displayName: "Тестовый читатель",
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        displayName: "Тестовый читатель",
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
        updatedAt: new Date(),
      },
    });

  console.log("Seed completed.");
  console.log(`Category: ${categoryName}`);
  console.log("Comic: Тестовый комикс R2.3");
  console.log("User: Тестовый читатель");
  console.log("Reading state: READING, chapter 3 / 12");
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
