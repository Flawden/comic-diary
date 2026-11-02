import { sql } from "drizzle-orm";
import { db } from "@/db";

/** One statement gives all entries and marks the same database snapshot. */
export async function exportUserDiary(userId: number) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("Invalid user ID");
  const result = await db.execute(sql`
    SELECT coalesce(jsonb_agg(entry ORDER BY comic_id), '[]'::jsonb) AS entries
    FROM (
      SELECT c.id AS comic_id, jsonb_build_object(
        'comic', jsonb_build_object(
          'id', c.id, 'slug', c.slug, 'title', c.title,
          'visibility', c.visibility, 'publicationStatus', c.publication_status,
          'description', c.description, 'authorName', c.author_name,
          'translatorName', c.translator_name, 'translatorNote', c.translator_note,
          'sourceUrl', c.source_url, 'coverUrl', c.cover_url,
          'category', cat.name, 'totalChapters', c.total_chapters,
          'workType', c.work_type, 'workFormat', c.work_format, 'seriesStatus', c.series_status
        ),
        'diary', jsonb_build_object(
          'status', uc.status, 'trackingEnabled', uc.tracking_enabled,
          'storedCurrentChapter', uc.current_chapter,
          'hasChapterRegistry', EXISTS (SELECT 1 FROM chapters ch WHERE ch.comic_id = c.id),
          'ratings', jsonb_build_object('plot', uc.rating_plot, 'characters', uc.rating_characters,
            'art', uc.rating_art, 'depth', uc.rating_depth, 'world', uc.rating_world),
          'personalNote', uc.personal_note, 'startedAt', uc.started_at,
          'completedAt', uc.completed_at, 'createdAt', uc.created_at, 'updatedAt', uc.updated_at
        ),
        'chapterMarks', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'chapterId', ch.id, 'displayCode', ch.display_code, 'title', ch.title,
            'kind', ch.kind, 'status', ch.status, 'sortOrder', ch.sort_order,
            'sourceUrl', ch.source_url, 'supersedesChapterId', ch.supersedes_chapter_id,
            'markedAt', mark.read_at, 'origin', mark.origin, 'rating', mark.rating
          ) ORDER BY ch.sort_order, ch.id)
          FROM user_chapter_reads mark JOIN chapters ch ON ch.id = mark.chapter_id
          WHERE mark.user_id = ${userId} AND ch.comic_id = c.id
        ), '[]'::jsonb)
      ) AS entry
      FROM user_comics uc JOIN comics c ON c.id = uc.comic_id
      LEFT JOIN categories cat ON cat.id = c.category_id
      WHERE uc.user_id = ${userId}
        AND (c.visibility = 'SHARED' OR (c.visibility = 'PRIVATE' AND c.owner_user_id = ${userId}))
    ) snapshot
  `);
  return {
    format: "comic-diary", schemaVersion: 1, exportedAt: new Date().toISOString(),
    timestampMeaning: "markedAt is the time the mark was recorded, not a confirmed reading date. storedCurrentChapter is stored numeric progress; chapterMarks are authoritative when a chapter registry exists.",
    entries: result.rows[0].entries as Array<{
      comic: { id: number; title: string; visibility: string };
      diary: { status: string; trackingEnabled: boolean; storedCurrentChapter: number; personalNote: string | null; ratings: { plot: number | null } };
      chapterMarks: Array<{ chapterId: number; status: string; kind: string; markedAt: string; origin: string; rating: number | null }>;
    }>,
  };
}
