import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, comics, userComics } from "@/db/schema";

export const teaCollectionSlug = "tea-territory";

// Status belongs to the current reader. Titles absent from their shelf still
// belong to the denominator, so the user restriction belongs in the LEFT JOIN.
export async function getCollectionProgress(userId: number, slug = teaCollectionSlug, connection: Pick<typeof db, "select"> = db) {
  const published = eq(comics.publicationStatus, "PUBLISHED");
  const archived = eq(comics.publicationStatus, "ARCHIVED");
  const [row] = await connection.select({
    name: categories.name,
    published: sql<number>`count(${comics.id}) filter (where ${published})`.mapWith(Number),
    completed: sql<number>`count(${comics.id}) filter (where ${published} and ${userComics.status} = 'COMPLETED')`.mapWith(Number),
    archivedOnShelf: sql<number>`count(${userComics.comicId}) filter (where ${archived})`.mapWith(Number),
  }).from(categories)
    .leftJoin(comics, and(eq(comics.categoryId, categories.id), eq(comics.visibility, "SHARED")))
    .leftJoin(userComics, and(eq(userComics.comicId, comics.id), eq(userComics.userId, userId)))
    .where(eq(categories.slug, slug))
    .groupBy(categories.id, categories.name);
  return row ?? null;
}
