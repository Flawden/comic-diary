import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { comicVolumeTitles } from "@/db/schema";

/** Volume names are purely editorial metadata; the numeric chapter grouping is canonical. */
export async function getComicVolumeTitles(comicId: number): Promise<Record<number, string>> {
  const rows = await db.select({
    number: comicVolumeTitles.volumeNumber,
    title: comicVolumeTitles.title,
  }).from(comicVolumeTitles)
    .where(eq(comicVolumeTitles.comicId, comicId))
    .orderBy(asc(comicVolumeTitles.volumeNumber));
  return Object.fromEntries(rows.map(row => [row.number, row.title]));
}
