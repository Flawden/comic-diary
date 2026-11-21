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
    ), raw_votes AS (
      SELECT u.user_id,u.rating_plot,u.rating_characters,u.rating_art,u.rating_depth,u.rating_world
      FROM user_comics u JOIN accessible a ON a.id=u.comic_id
      WHERE NOT EXISTS (SELECT 1 FROM community_reviews r WHERE r.comic_id=u.comic_id AND r.user_id=u.user_id AND r.chapter_id IS NULL)
      UNION ALL
      SELECT r.user_id,r.rating_plot,r.rating_characters,r.rating_art,r.rating_depth,r.rating_world
      FROM community_reviews r JOIN accessible a ON a.id=r.comic_id WHERE r.chapter_id IS NULL AND r.deleted_at IS NULL AND r.hidden_at IS NULL
    ), votes AS (
      SELECT u.user_id, u.rating_plot, u.rating_characters, u.rating_art, u.rating_depth, u.rating_world,
        (coalesce(u.rating_plot,0) + coalesce(u.rating_characters,0) + coalesce(u.rating_art,0)
          + coalesce(u.rating_depth,0) + coalesce(u.rating_world,0))::numeric /
        nullif((u.rating_plot IS NOT NULL)::int + (u.rating_characters IS NOT NULL)::int
          + (u.rating_art IS NOT NULL)::int + (u.rating_depth IS NOT NULL)::int
          + (u.rating_world IS NOT NULL)::int, 0) AS personal_average
      FROM raw_votes u
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
    ), chapter_votes AS (
      SELECT p.chapter_id,p.user_id,p.rating FROM user_chapter_reads p
      JOIN chapters c ON c.id=p.chapter_id JOIN accessible a ON a.id=c.comic_id
      WHERE p.rating IS NOT NULL AND NOT EXISTS(SELECT 1 FROM community_reviews r WHERE r.chapter_id=p.chapter_id AND r.user_id=p.user_id)
      UNION ALL
      SELECT r.chapter_id,r.user_id,r.rating FROM community_reviews r JOIN accessible a ON a.id=r.comic_id
      WHERE r.chapter_id IS NOT NULL AND r.deleted_at IS NULL AND r.hidden_at IS NULL
    ), chapter_scores AS (
      SELECT c.id, jsonb_build_object('average', avg(r.rating), 'votes', count(DISTINCT r.user_id)) AS value
      FROM chapters c JOIN accessible a ON a.id = c.comic_id
      LEFT JOIN chapter_votes r ON r.chapter_id = c.id AND r.rating IS NOT NULL
      WHERE c.status = 'RELEASED' GROUP BY c.id
    ), volume_readers AS (
      SELECT c.volume_number,r.user_id,avg(r.rating) AS reader_average
      FROM chapter_votes r JOIN chapters c ON c.id=r.chapter_id
      WHERE c.status='RELEASED' AND c.kind='MAIN' AND c.volume_number IS NOT NULL
      GROUP BY c.volume_number,r.user_id
    ), volume_scores AS (
      SELECT volume_number, jsonb_build_object('average',avg(reader_average),'votes',count(*)) AS value
      FROM volume_readers GROUP BY volume_number
    ), viewer_scores AS (
      SELECT r.chapter_id,jsonb_build_object('rating',CASE WHEN r.deleted_at IS NULL THEN r.rating ELSE NULL END,
        'source',CASE WHEN r.deleted_at IS NULL THEN 'review' ELSE 'withdrawn' END,'hidden',r.hidden_at IS NOT NULL) AS value
      FROM community_reviews r JOIN accessible a ON a.id=r.comic_id WHERE r.chapter_id IS NOT NULL AND r.user_id=${viewerUserId}
      UNION ALL
      SELECT u.chapter_id,jsonb_build_object('rating',u.rating,'source','diary','hidden',false)
      FROM user_chapter_reads u JOIN chapters c ON c.id=u.chapter_id JOIN accessible a ON a.id=c.comic_id
      WHERE u.user_id=${viewerUserId} AND NOT EXISTS(SELECT 1 FROM community_reviews r WHERE r.chapter_id=u.chapter_id AND r.user_id=u.user_id)
    )
    SELECT work.value || jsonb_build_object('chapters', coalesce(
      (SELECT jsonb_object_agg(id, value) FROM chapter_scores), '{}'::jsonb),
      'volumes',coalesce((SELECT jsonb_object_agg(volume_number,value) FROM volume_scores),'{}'::jsonb),
      'viewerChapters',coalesce((SELECT jsonb_object_agg(chapter_id,value) FROM viewer_scores),'{}'::jsonb)) AS ratings
    FROM accessible CROSS JOIN work
  `);
  return result.rows[0]?.ratings ?? null;
}
