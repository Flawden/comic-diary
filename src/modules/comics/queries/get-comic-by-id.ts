import {
  and,
  eq,
  or,
} from "drizzle-orm";

import { db } from "@/db";
import { comics } from "@/db/schema";

export async function getComicById(
  id: number,
  viewerUserId: number | null = null,
) {
  const visibilityPredicate =
    viewerUserId === null
      ? eq(
          comics.visibility,
          "SHARED",
        )
      : or(
          eq(
            comics.visibility,
            "SHARED",
          ),
          and(
            eq(
              comics.visibility,
              "PRIVATE",
            ),
            eq(
              comics.ownerUserId,
              viewerUserId,
            ),
          ),
        );

  const result = await db
    .select({
      id: comics.id,
      visibility: comics.visibility,
      ownerUserId: comics.ownerUserId,
    })
    .from(comics)
    .where(
      and(
        eq(
          comics.id,
          id,
        ),
        visibilityPredicate,
      ),
    )
    .limit(1);

  return result[0] ?? null;
}

export type ComicReadIdentity =
  NonNullable<
    Awaited<
      ReturnType<typeof getComicById>
    >
  >;
