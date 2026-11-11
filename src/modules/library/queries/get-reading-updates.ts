import { sql } from "drizzle-orm";
import { db } from "@/db";

export type UpdatesKind = "MAIN" | "SPECIAL" | "UPDATED" | "ALL";
export type UpdatesStatus = "READING" | "WANT_TO_READ" | "ON_HOLD" | "COMPLETED" | "ALL";
export type UpdatesOptions = { kind: UpdatesKind; status: UpdatesStatus; q: string; page: number };
export type UpdatesTitle = { comicId: number; slug: string; title: string; coverUrl: string | null; promptChapterRating: boolean; mainCount: number; specialCount: number; updatedCount: number; total: number };
export type UpdatesChapter = { id: number; displayCode: string; title: string | null; sourceUrl: string | null; kind: string; updated: boolean; volumeNumber: number | null; volumeTitle?: string | null; throughCount: number; total: number };

export function parseUpdatesOptions(params: Record<string, string | string[] | undefined>): UpdatesOptions {
  const first = (key: string) => { const v = params[key]; return Array.isArray(v) ? v[0] : v; };
  const rawKind = first("kind");
  const rawStatus = first("status");
  const page = Number(first("page") ?? 1);
  return {
    kind: (["MAIN", "SPECIAL", "UPDATED", "ALL"].includes(rawKind ?? "") ? rawKind : "ALL") as UpdatesKind,
    status: (["READING", "WANT_TO_READ", "ON_HOLD", "COMPLETED", "ALL"].includes(rawStatus ?? "") ? rawStatus : "ALL") as UpdatesStatus,
    q: (first("q") ?? "").trim().slice(0, 160),
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1,
  };
}

// UNION (rather than UNION ALL) also terminates malformed cyclic revision chains.
function unreadRegistry(userId: number, status: UpdatesStatus = "ALL") {
  return sql`WITH RECURSIVE eligible AS (
    SELECT c.id, c.slug, c.title, c.cover_url, uc.prompt_chapter_rating FROM comics c
    JOIN user_comics uc ON uc.comic_id = c.id
    WHERE uc.user_id = ${userId} AND uc.in_library = TRUE AND uc.tracking_enabled = TRUE
      AND (c.visibility = 'SHARED' OR (c.visibility = 'PRIVATE' AND c.owner_user_id = ${userId}))
      AND (${status} = 'ALL' OR uc.status::text = ${status})
  ), read_lineage(id) AS (
    SELECT r.chapter_id FROM user_chapter_reads r JOIN chapters c ON c.id = r.chapter_id
    JOIN eligible e ON e.id = c.comic_id WHERE r.user_id = ${userId}
    UNION
    SELECT c.id FROM chapters c JOIN read_lineage p ON c.supersedes_chapter_id = p.id
    JOIN eligible e ON e.id = c.comic_id
  ), unread AS (
    SELECT c.*, EXISTS (SELECT 1 FROM read_lineage l WHERE l.id = c.id) AS updated
    FROM chapters c JOIN eligible e ON e.id = c.comic_id
    WHERE c.status = 'RELEASED' AND NOT EXISTS (
      SELECT 1 FROM user_chapter_reads r WHERE r.chapter_id = c.id AND r.user_id = ${userId}
    )
  )`;
}
function kindPredicate(kind: UpdatesKind) {
  return kind === "UPDATED" ? sql`u.updated` : kind === "ALL" ? sql`TRUE` : sql`u.kind = ${kind}`;
}

export async function getReadingUpdates(userId: number, options: UpdatesOptions) {
  const context = unreadRegistry(userId, options.status);
  const [titles, counts] = await Promise.all([
    db.execute<UpdatesTitle>(sql`${context}
      SELECT e.id AS "comicId", e.slug, e.title, e.cover_url AS "coverUrl",
        e.prompt_chapter_rating AS "promptChapterRating",
        count(*) FILTER (WHERE u.kind = 'MAIN')::int AS "mainCount",
        count(*) FILTER (WHERE u.kind = 'SPECIAL')::int AS "specialCount",
        count(*) FILTER (WHERE u.updated)::int AS "updatedCount",
        count(*) OVER ()::int AS total
      FROM eligible e JOIN unread u ON u.comic_id = e.id
      WHERE strpos(lower(e.title), lower(${options.q})) > 0 OR ${options.q} = ''
      GROUP BY e.id, e.slug, e.title, e.cover_url, e.prompt_chapter_rating
      HAVING bool_or(${kindPredicate(options.kind)})
      ORDER BY e.title, e.id LIMIT 20 OFFSET ${(options.page - 1) * 20}`),
    db.execute<{ libraryCount: number; missingCount: number; totalCount: number }>(sql`${context}
      SELECT (SELECT count(*)::int FROM eligible matched WHERE (${options.q} = '' OR strpos(lower(matched.title), lower(${options.q})) > 0)
        AND EXISTS (SELECT 1 FROM unread u WHERE u.comic_id = matched.id AND ${kindPredicate(options.kind)})) AS "totalCount",
        count(*)::int AS "libraryCount", count(*) FILTER (WHERE NOT EXISTS
        (SELECT 1 FROM chapters c WHERE c.comic_id = e.id))::int AS "missingCount" FROM eligible e`),
  ]);
  return { titles: titles.rows, total: counts.rows[0]?.totalCount ?? 0,
    libraryCount: counts.rows[0]?.libraryCount ?? 0, missingCount: counts.rows[0]?.missingCount ?? 0 };
}

export async function getUnreadChapters(userId: number, comicId: number, kind: UpdatesKind, offset: number) {
  // Restrict the same ownership predicate before returning any chapter metadata.
  const result = await db.execute<UpdatesChapter>(sql`${unreadRegistry(userId)}
    SELECT u.id, u.display_code AS "displayCode", u.title, u.source_url AS "sourceUrl", u.kind, u.updated,
      u.volume_number AS "volumeNumber",
      vt.title AS "volumeTitle",
      CASE WHEN u.kind = 'MAIN' THEN (SELECT count(*)::int FROM unread p
        WHERE p.comic_id = u.comic_id AND p.kind = 'MAIN'
          AND (p.sort_order, p.id) <= (u.sort_order, u.id)) ELSE 0 END AS "throughCount",
      count(*) OVER ()::int AS total
    FROM unread u LEFT JOIN comic_volume_titles vt
      ON vt.comic_id = u.comic_id AND vt.volume_number = u.volume_number
    WHERE u.comic_id = ${comicId} AND ${kindPredicate(kind)}
    ORDER BY u.sort_order, u.id LIMIT 30 OFFSET ${offset}`);
  return { chapters: result.rows, total: result.rows[0]?.total ?? 0 };
}
