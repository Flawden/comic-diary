import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { CommunityRatings } from "../ratings/community-rating";

/** One statement/snapshot for the work and ALL released chapters; no voter PII.
 * No membership/active-account filter: saved historical votes remain votes.
 * Provisional overall policy: equal reader weight, without intermediate rounding.
 * This CTE can be replaced without changing raw personal ratings or schema.
 */
export async function getCommunityRatings(comicId: number, viewerUserId: number | null = null): Promise<CommunityRatings | null> {
  if (!Number.isSafeInteger(comicId) || comicId <= 0 || comicId > 2147483647 ||
      (viewerUserId !== null && (!Number.isSafeInteger(viewerUserId) || viewerUserId <= 0 || viewerUserId > 2147483647))) return null;
  const result = await db.execute<{ ratings: CommunityRatings }>(sql`
    WITH accessible AS (
      SELECT id FROM comics WHERE id = ${comicId} AND publication_status = 'PUBLISHED'
        AND (visibility = 'SHARED' OR (visibility = 'PRIVATE' AND owner_user_id = ${viewerUserId}))
    ), votes AS (
      SELECT u.user_id, u.rating_plot, u.rating_characters, u.rating_art, u.rating_depth, u.rating_world,
        (coalesce(u.rating_plot,0) + coalesce(u.rating_characters,0) + coalesce(u.rating_art,0)
          + coalesce(u.rating_depth,0) + coalesce(u.rating_world,0))::numeric /
        nullif((u.rating_plot IS NOT NULL)::int + (u.rating_characters IS NOT NULL)::int
          + (u.rating_art IS NOT NULL)::int + (u.rating_depth IS NOT NULL)::int
          + (u.rating_world IS NOT NULL)::int, 0) AS personal_average
      FROM user_comics u JOIN accessible a ON a.id = u.comic_id
    ), work AS (
      SELECT jsonb_build_object(
        'overall', jsonb_build_object('average', avg(personal_average), 'votes', count(DISTINCT user_id) FILTER (WHERE personal_average IS NOT NULL)),
        'criteria', jsonb_build_object(
          'plot', jsonb_build_object('average', avg(rating_plot), 'votes', count(DISTINCT user_id) FILTER (WHERE rating_plot IS NOT NULL)),
          'characters', jsonb_build_object('average', avg(rating_characters), 'votes', count(DISTINCT user_id) FILTER (WHERE rating_characters IS NOT NULL)),
          'art', jsonb_build_object('average', avg(rating_art), 'votes', count(DISTINCT user_id) FILTER (WHERE rating_art IS NOT NULL)),
          'depth', jsonb_build_object('average', avg(rating_depth), 'votes', count(DISTINCT user_id) FILTER (WHERE rating_depth IS NOT NULL)),
          'world', jsonb_build_object('average', avg(rating_world), 'votes', count(DISTINCT user_id) FILTER (WHERE rating_world IS NOT NULL))
        )) AS value FROM votes
    ), chapter_scores AS (
      SELECT c.id, jsonb_build_object('average', avg(r.rating), 'votes', count(DISTINCT r.user_id)) AS value
      FROM chapters c JOIN accessible a ON a.id = c.comic_id
      LEFT JOIN user_chapter_reads r ON r.chapter_id = c.id AND r.rating IS NOT NULL
      WHERE c.status = 'RELEASED' GROUP BY c.id
    )
    SELECT work.value || jsonb_build_object('chapters', coalesce(
      (SELECT jsonb_object_agg(id, value) FROM chapter_scores), '{}'::jsonb)) AS ratings
    FROM accessible CROSS JOIN work
  `);
  return result.rows[0]?.ratings ?? null;
}
