import { isWorkType, isWorkFormat, type WorkType, type WorkFormat } from "@/modules/comics/work-metadata";
import { isSeriesStatus, type SeriesStatus } from "@/modules/comics/series-status";
import {
  randomUUID,
} from "node:crypto";

import {
  and,
  eq,
} from "drizzle-orm";

import {
  db,
} from "@/db";

import {
  comics,
  userComics,
  userEntitlements,
} from "@/db/schema";

export type PrivateTitleMetadataInput = {
  title: string;
  sourceUrl: string;
  totalChapters: number | null;
  seriesStatus?: SeriesStatus;
  workType?: WorkType;
  workFormat?: WorkFormat;
};

export type PrivateTitleCreateInput =
  PrivateTitleMetadataInput;

export type PrivateTitleMutationErrorKind =
  | "entitlement-required"
  | "invalid-title"
  | "invalid-source-url"
  | "invalid-total-chapters"
  | "total-chapters-below-progress"
  | "private-title-not-found";

export class PrivateTitleMutationError
  extends Error {
  constructor(
    readonly kind:
      PrivateTitleMutationErrorKind,
  ) {
    super(
      `Private title mutation failed: ${kind}`,
    );

    this.name =
      "PrivateTitleMutationError";
  }
}

function normalizePrivateTitle(
  input: PrivateTitleMetadataInput,
) {
  const title =
    input.title.trim();

  if (
    title.length === 0 ||
    title.length > 255
  ) {
    throw new PrivateTitleMutationError(
      "invalid-title",
    );
  }

  if (input.workType !== undefined && !isWorkType(input.workType)) throw new PrivateTitleMutationError("invalid-title");
  if (input.workFormat !== undefined && !isWorkFormat(input.workFormat)) throw new PrivateTitleMutationError("invalid-title");
  if (input.seriesStatus !== undefined && !isSeriesStatus(input.seriesStatus)) throw new PrivateTitleMutationError("invalid-title");

  const sourceUrl =
    input.sourceUrl.trim();

  if (
    sourceUrl.length === 0 ||
    sourceUrl.length > 2048
  ) {
    throw new PrivateTitleMutationError(
      "invalid-source-url",
    );
  }

  let parsedSourceUrl:
    URL;

  try {
    parsedSourceUrl =
      new URL(
        sourceUrl,
      );
  } catch {
    throw new PrivateTitleMutationError(
      "invalid-source-url",
    );
  }

  if (
    parsedSourceUrl.protocol !==
      "http:" &&
    parsedSourceUrl.protocol !==
      "https:"
  ) {
    throw new PrivateTitleMutationError(
      "invalid-source-url",
    );
  }

  if (
    input.totalChapters !== null &&
    (
      !Number.isSafeInteger(
        input.totalChapters,
      ) ||
      input.totalChapters < 1
    )
  ) {
    throw new PrivateTitleMutationError(
      "invalid-total-chapters",
    );
  }

  return {
    seriesStatus: input.seriesStatus,
    workType: input.workType,
    workFormat: input.workFormat,
    title,
    sourceUrl:
      parsedSourceUrl.toString(),
    totalChapters:
      input.totalChapters,
  };
}

function createPrivateSlug() {
  return `private-${randomUUID()}`;
}

export async function createOwnPrivateTitle(
  userId: number,
  input: PrivateTitleCreateInput,
) {
  if (
    !Number.isInteger(userId) ||
    userId <= 0
  ) {
    throw new PrivateTitleMutationError(
      "entitlement-required",
    );
  }

  const normalized =
    normalizePrivateTitle(
      input,
    );

  return db.transaction(
    async (
      tx,
    ) => {
      const entitlementRows =
        await tx
          .select({
            userId:
              userEntitlements.userId,
          })
          .from(
            userEntitlements,
          )
          .where(
            and(
              eq(
                userEntitlements.userId,
                userId,
              ),
              eq(
                userEntitlements.entitlement,
                "PRIVATE_CATALOG",
              ),
            ),
          )
          .limit(
            1,
          );

      if (
        entitlementRows.length !==
        1
      ) {
        throw new PrivateTitleMutationError(
          "entitlement-required",
        );
      }

      const inserted =
        await tx
          .insert(
            comics,
          )
          .values({
            slug:
              createPrivateSlug(),

            title:
              normalized.title,

            sourceUrl:
              normalized.sourceUrl,

            totalChapters:
              normalized.totalChapters,

            seriesStatus: normalized.seriesStatus,
            workType: normalized.workType,
            workFormat: normalized.workFormat,

            publicationStatus:
              "PUBLISHED",

            visibility:
              "PRIVATE",

            ownerUserId:
              userId,

            categoryId:
              null,
          })
          .returning({
            id:
              comics.id,

            slug:
              comics.slug,
          });

      const created =
        inserted[0];

      if (!created) {
        throw new Error(
          "Private title create failed",
        );
      }

      await tx
        .insert(
          userComics,
        )
        .values({
          userId,
          comicId:
            created.id,
          status:
            "WANT_TO_READ",
          currentChapter:
            0,
        });

      return created;
    },
  );
}

export async function updateOwnPrivateTitleMetadata(
  userId: number,
  comicId: number,
  input: PrivateTitleMetadataInput,
) {
  if (
    !Number.isInteger(userId) ||
    userId <= 0 ||
    !Number.isInteger(comicId) ||
    comicId <= 0
  ) {
    throw new PrivateTitleMutationError(
      "private-title-not-found",
    );
  }

  const normalized =
    normalizePrivateTitle(
      input,
    );

  return db.transaction(
    async (
      tx,
    ) => {
      const rows =
        await tx
          .select({
            id:
              comics.id,

            slug:
              comics.slug,

            currentChapter:
              userComics.currentChapter,
          })
          .from(
            comics,
          )
          .innerJoin(
            userComics,
            and(
              eq(
                userComics.comicId,
                comics.id,
              ),
              eq(
                userComics.userId,
                userId,
              ),
            ),
          )
          .where(
            and(
              eq(
                comics.id,
                comicId,
              ),
              eq(
                comics.visibility,
                "PRIVATE",
              ),
              eq(
                comics.ownerUserId,
                userId,
              ),
            ),
          )
          .limit(
            1,
          );

      const current =
        rows[0];

      if (!current) {
        throw new PrivateTitleMutationError(
          "private-title-not-found",
        );
      }

      if (
        normalized.totalChapters !==
          null &&
        normalized.totalChapters <
          current.currentChapter
      ) {
        throw new PrivateTitleMutationError(
          "total-chapters-below-progress",
        );
      }

      const updated =
        await tx
          .update(
            comics,
          )
          .set({
            title:
              normalized.title,

            sourceUrl:
              normalized.sourceUrl,

            totalChapters:
              normalized.totalChapters,

            seriesStatus: normalized.seriesStatus,
            workType: normalized.workType,
            workFormat: normalized.workFormat,

            updatedAt:
              new Date(),
          })
          .where(
            and(
              eq(
                comics.id,
                current.id,
              ),
              eq(
                comics.visibility,
                "PRIVATE",
              ),
              eq(
                comics.ownerUserId,
                userId,
              ),
            ),
          )
          .returning({
            slug:
              comics.slug,
          });

      const result =
        updated[0];

      if (!result) {
        throw new PrivateTitleMutationError(
          "private-title-not-found",
        );
      }

      return result;
    },
  );
}

export async function deleteOwnPrivateTitle(
  userId: number,
  comicId: number,
) {
  if (
    !Number.isInteger(userId) ||
    userId <= 0 ||
    !Number.isInteger(comicId) ||
    comicId <= 0
  ) {
    throw new PrivateTitleMutationError(
      "private-title-not-found",
    );
  }

  return db.transaction(
    async (
      tx,
    ) => {
      const deleted =
        await tx
          .delete(
            comics,
          )
          .where(
            and(
              eq(
                comics.id,
                comicId,
              ),
              eq(
                comics.visibility,
                "PRIVATE",
              ),
              eq(
                comics.ownerUserId,
                userId,
              ),
            ),
          )
          .returning({
            id:
              comics.id,
          });

      if (
        deleted.length !==
        1
      ) {
        throw new PrivateTitleMutationError(
          "private-title-not-found",
        );
      }

      return {
        comicId:
          deleted[0].id,
      };
    },
  );
}
