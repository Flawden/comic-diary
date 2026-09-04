import {
  asc,
  desc,
  eq,
} from "drizzle-orm";

import {
  db,
} from "@/db";

import {
  categories,
  comics,
  users,
} from "@/db/schema";

export async function listAdminCategories() {
  return db
    .select({
      id:
        categories.id,
      slug:
        categories.slug,
      name:
        categories.name,
      description:
        categories.description,
      updatedAt:
        categories.updatedAt,
    })
    .from(
      categories,
    )
    .orderBy(
      asc(
        categories.name,
      ),
    );
}

/**
 * Admin/editor read model deliberately includes hidden and archived comics.
 * The public getComics() query is not reused because public visibility rules
 * must not hide records from catalog administration.
 */
export async function listAdminComics() {
  return db
    .select({
      id:
        comics.id,
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
      categoryName:
        categories.name,
      updatedAt:
        comics.updatedAt,
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
    .orderBy(
      asc(
        comics.title,
      ),
    );
}

/**
 * Never exposes password hashes or session token digests.
 */
export async function listAdminUsers() {
  return db
    .select({
      id:
        users.id,
      email:
        users.email,
      displayName:
        users.displayName,
      role:
        users.role,
      isActive:
        users.isActive,
      createdAt:
        users.createdAt,
      updatedAt:
        users.updatedAt,
    })
    .from(
      users,
    )
    .orderBy(
      desc(
        users.createdAt,
      ),
      desc(
        users.id,
      ),
    );
}

export async function getAdminDashboardCounts() {
  const [
    comicRows,
    categoryRows,
    userRows,
  ] =
    await Promise.all([
      db
        .select({
          id:
            comics.id,
        })
        .from(
          comics,
        ),

      db
        .select({
          id:
            categories.id,
        })
        .from(
          categories,
        ),

      db
        .select({
          id:
            users.id,
        })
        .from(
          users,
        ),
    ]);

  return {
    comics:
      comicRows.length,
    categories:
      categoryRows.length,
    users:
      userRows.length,
  };
}
