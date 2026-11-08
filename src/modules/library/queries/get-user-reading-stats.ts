import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Active shelf counters plus chapter marks from all retained diary entries. */
export async function getUserReadingStats(userId: number) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("Invalid user ID");
  const result = await db.execute(sql`
    WITH diary AS (
      SELECT uc.comic_id, uc.status, uc.tracking_enabled, uc.current_chapter, uc.in_library
      FROM user_comics uc JOIN comics c ON c.id = uc.comic_id
      WHERE uc.user_id = ${userId}
        AND (c.visibility = 'SHARED' OR (c.visibility = 'PRIVATE' AND c.owner_user_id = ${userId}))
    ), library AS (
      SELECT * FROM diary WHERE in_library = TRUE
    ), marks AS (
      SELECT ch.status, ch.kind
      FROM user_chapter_reads r
      JOIN chapters ch ON ch.id = r.chapter_id
      JOIN diary l ON l.comic_id = ch.comic_id
      WHERE r.user_id = ${userId}
    )
    SELECT
      (SELECT count(*) FROM library) AS titles,
      (SELECT count(*) FROM library WHERE tracking_enabled) AS tracked,
      (SELECT count(*) FROM library WHERE status = 'WANT_TO_READ') AS planned,
      (SELECT count(*) FROM library WHERE status = 'READING') AS reading,
      (SELECT count(*) FROM library WHERE status = 'COMPLETED') AS completed,
      (SELECT count(*) FROM library WHERE status = 'ON_HOLD') AS on_hold,
      (SELECT count(*) FROM marks WHERE status = 'RELEASED' AND kind = 'MAIN') AS main,
      (SELECT count(*) FROM marks WHERE status = 'RELEASED' AND kind = 'SPECIAL') AS specials,
      (SELECT count(*) FROM marks WHERE status = 'ARCHIVED') AS archived,
      (SELECT count(*) FROM library l WHERE current_chapter > 0
        AND NOT EXISTS (SELECT 1 FROM chapters ch WHERE ch.comic_id = l.comic_id)) AS legacy_titles
  `);
  const row = result.rows[0];
  return {
    titles: Number(row.titles), tracked: Number(row.tracked),
    planned: Number(row.planned), reading: Number(row.reading),
    completed: Number(row.completed), onHold: Number(row.on_hold),
    main: Number(row.main), specials: Number(row.specials),
    archived: Number(row.archived), legacyTitles: Number(row.legacy_titles),
  };
}

export type UserReadingStats = Awaited<ReturnType<typeof getUserReadingStats>>;
