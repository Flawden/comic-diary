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

export type PrivateTitleCreateInput = {
  title: string;
  sourceUrl: string;
  totalChapters: number | null;
};

export type PrivateTitleMutationErrorKind =
  | "entitlement-required"
  | "invalid-title"
  | "invalid-source-url"
  | "invalid-total-chapters"
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
  input: PrivateTitleCreateInput,
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
