import {
  asc,
  desc,
  eq,
  inArray,
} from "drizzle-orm";

import {
  db,
} from "@/db";

import {
  administrativeAuditEvents,
  categories,
  chapters,
  comics,
  userEntitlements,
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
  const comicRows =
    await db
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
      seriesStatus: comics.seriesStatus,
      workType: comics.workType,
      workFormat: comics.workFormat,
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
    .where(
      eq(
        comics.visibility,
        "SHARED",
      ),
    )
    .orderBy(
      asc(
        comics.title,
      ),
    );

  const chapterRows =
    await getAdminComicChaptersByComicIds(
      comicRows.map(
        (comic) => comic.id,
      ),
    );

  const chaptersByComic =
    new Map();

  for (const chapter of chapterRows) {
    const current =
      chaptersByComic.get(
        chapter.comicId,
      ) ?? [];

    current.push(
      chapter,
    );

    chaptersByComic.set(
      chapter.comicId,
      current,
    );
  }

  return comicRows.map(
    (comic) => ({
      ...comic,

      chapters:
        chaptersByComic.get(
          comic.id,
        ) ?? [],
    }),
  );
}

/**
 * Never exposes password hashes or session token digests.
 */


/**
 * Admin chapter read model deliberately exposes
 * every chapter state.
 *
 * Unlike public chapter reads, administration needs
 * visibility into scheduled and archived records.
 */
export async function getAdminComicChaptersByComicIds(
  comicIds: number[],
) {
  if (comicIds.length === 0) {
    return [];
  }

  return db
    .select({
      id:
        chapters.id,

      comicId:
        chapters.comicId,

      kind: chapters.kind,
      supersedesChapterId: chapters.supersedesChapterId,
      displayCode:
        chapters.displayCode,

      title:
        chapters.title,

      sourceUrl:
        chapters.sourceUrl,

      sortOrder:
        chapters.sortOrder,

      status:
        chapters.status,

      releasedAt:
        chapters.releasedAt,
      expectedRelease: chapters.expectedRelease,
      createdAt: chapters.createdAt,

      updatedAt:
        chapters.updatedAt,
    })
    .from(
      chapters,
    )
    .where(
      inArray(
        chapters.comicId,
        comicIds,
      ),
    )
    .orderBy(
      asc(
        chapters.comicId,
      ),
      asc(
        chapters.sortOrder,
      ),
      asc(
        chapters.id,
      ),
    );
}




export async function listAdminUsers() {
  const [
    userRows,
    entitlementRows,
  ] =
    await Promise.all([
      db
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
        ),

      db
        .select({
          userId:
            userEntitlements.userId,
          entitlement:
            userEntitlements.entitlement,
        })
        .from(
          userEntitlements,
        )
        .orderBy(
          asc(
            userEntitlements.entitlement,
          ),
        ),
    ]);

  const byUserId =
    new Map<
      number,
      (typeof entitlementRows)[number]["entitlement"][]
    >();

  for (
    const row of entitlementRows
  ) {
    const current =
      byUserId.get(
        row.userId,
      ) ?? [];

    current.push(
      row.entitlement,
    );

    byUserId.set(
      row.userId,
      current,
    );
  }

  return userRows.map(
    (user) => ({
      ...user,
      entitlements:
        byUserId.get(
          user.id,
        ) ?? [],
    }),
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
        )
        .where(
          eq(
            comics.visibility,
            "SHARED",
          ),
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

/**
 * ADMIN_SECURITY read model for the durable administrative audit trail.
 *
 * Details are curated mutation metadata only; password hashes, session-token
 * digests and raw authentication secrets are never stored in audit events.
 */
export async function listAdministrativeAuditEvents(
  limit = 200,
) {
  const boundedLimit =
    Math.max(
      1,
      Math.min(
        limit,
        500,
      ),
    );

  return db
    .select({
      id:
        administrativeAuditEvents.id,
      actorUserId:
        administrativeAuditEvents.actorUserId,
      actorRole:
        administrativeAuditEvents.actorRole,
      actorEmail:
        users.email,
      actorDisplayName:
        users.displayName,
      action:
        administrativeAuditEvents.action,
      targetType:
        administrativeAuditEvents.targetType,
      targetId:
        administrativeAuditEvents.targetId,
      targetKey:
        administrativeAuditEvents.targetKey,
      details:
        administrativeAuditEvents.details,
      occurredAt:
        administrativeAuditEvents.occurredAt,
    })
    .from(
      administrativeAuditEvents,
    )
    .leftJoin(
      users,
      eq(
        administrativeAuditEvents.actorUserId,
        users.id,
      ),
    )
    .orderBy(
      desc(
        administrativeAuditEvents.occurredAt,
      ),
      desc(
        administrativeAuditEvents.id,
      ),
    )
    .limit(
      boundedLimit,
    );
}
