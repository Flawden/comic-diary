import { isWorkType, isWorkFormat } from "@/modules/comics/work-metadata";
import { isSeriesStatus } from "@/modules/comics/series-status";
import {
  type NextRequest,
  NextResponse,
} from "next/server";

import type {
  CatalogComic,
} from "@/catalog/catalog-data";

import {
  authorizeSharedCatalogMutationRequest,
} from "@/modules/catalog/shared-catalog-authorization";
import {
  createSharedCatalogComic,
  SharedCatalogMutationError,
  updateSharedCatalogComic,
} from "@/modules/catalog/shared-catalog-mutations";

export const runtime =
  "nodejs";

const MAX_REQUEST_BYTES =
  64 * 1024;

const publicationStatuses =
  new Set<
    CatalogComic["publicationStatus"]
  >([
    "PUBLISHED",
    "HIDDEN",
    "ARCHIVED",
  ]);

function jsonResponse(
  value: unknown,
  status = 200,
) {
  return NextResponse.json(
    value,
    {
      status,

      headers: {
        "cache-control":
          "no-store",

        "x-content-type-options":
          "nosniff",
      },
    },
  );
}

function errorResponse(
  kind: string,
  status: number,
) {
  return jsonResponse(
    {
      ok: false,

      error: {
        kind,
      },
    },
    status,
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isNullableString(
  value: unknown,
): value is string | null {
  return (
    value === null ||
    typeof value ===
      "string"
  );
}

function parseCatalogComic(
  value: unknown,
): CatalogComic | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.slug !==
      "string" ||
    typeof value.title !==
      "string" ||
    !isNullableString(
      value.description,
    ) ||
    !isNullableString(
      value.authorName,
    ) ||
    !isNullableString(
      value.translatorName,
    ) ||
    !isNullableString(
      value.translatorNote,
    ) ||
    !isNullableString(
      value.coverUrl,
    ) ||
    (value.bannerUrl !== undefined && !isNullableString(value.bannerUrl)) ||
    !isNullableString(value.sourceUrl) ||
    typeof value.categorySlug !==
      "string"
  ) {
    return null;
  }

  if (
    value.totalChapters !== null &&
    (
      typeof value.totalChapters !==
        "number" ||
      !Number.isInteger(
        value.totalChapters,
      )
    )
  ) {
    return null;
  }

  if (
    typeof value.publicationStatus !==
      "string" ||
    !publicationStatuses.has(
      value.publicationStatus as
        CatalogComic["publicationStatus"],
    )
  ) {
    return null;
  }

  if (value.workType !== undefined && !isWorkType(value.workType)) return null;
  if (value.workFormat !== undefined && !isWorkFormat(value.workFormat)) return null;
  if (value.seriesStatus !== undefined && !isSeriesStatus(value.seriesStatus)) return null;
  return {
    workType: value.workType as CatalogComic["workType"],
    workFormat: value.workFormat as CatalogComic["workFormat"],
    seriesStatus: value.seriesStatus as CatalogComic["seriesStatus"],
    slug:
      value.slug,

    title:
      value.title,

    description:
      value.description,

    authorName:
      value.authorName,

    translatorName:
      value.translatorName,

    translatorNote:
      value.translatorNote,

    coverUrl:
      value.coverUrl,

    bannerUrl: value.bannerUrl as string | null | undefined,

    sourceUrl:
      typeof value.sourceUrl === "string" ? (value.sourceUrl.trim() || null) : null,

    totalChapters:
      value.totalChapters,

    publicationStatus:
      value.publicationStatus as
        CatalogComic["publicationStatus"],

    categorySlug:
      value.categorySlug,
  };
}

type BodyReadResult =
  | {
      ok: true;
      comic: CatalogComic;
    }
  | {
      ok: false;
      response: NextResponse;
    };

async function readCatalogComic(
  request: NextRequest,
): Promise<BodyReadResult> {
  const contentType =
    request.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();

  if (
    contentType !==
      "application/json"
  ) {
    return {
      ok: false,

      response:
        errorResponse(
          "unsupported-media-type",
          415,
        ),
    };
  }

  const rawLength =
    request.headers.get(
      "content-length",
    );

  if (rawLength) {
    const contentLength =
      Number(rawLength);

    if (
      Number.isFinite(
        contentLength,
      ) &&
      contentLength >
        MAX_REQUEST_BYTES
    ) {
      return {
        ok: false,

        response:
          errorResponse(
            "request-too-large",
            413,
          ),
      };
    }
  }

  const text =
    await request.text();

  if (
    Buffer.byteLength(
      text,
      "utf8",
    ) >
    MAX_REQUEST_BYTES
  ) {
    return {
      ok: false,

      response:
        errorResponse(
          "request-too-large",
          413,
        ),
    };
  }

  let parsed:
    unknown;

  try {
    parsed =
      JSON.parse(
        text,
      );
  } catch {
    return {
      ok: false,

      response:
        errorResponse(
          "invalid-json",
          400,
        ),
    };
  }

  const comic =
    parseCatalogComic(
      parsed,
    );

  if (!comic) {
    return {
      ok: false,

      response:
        errorResponse(
          "invalid-catalog-request",
          400,
        ),
    };
  }

  return {
    ok: true,
    comic,
  };
}

function mutationErrorResponse(
  error: unknown,
) {
  if (
    error instanceof
      SharedCatalogMutationError
  ) {
    if (
      error.kind ===
      "comic-already-exists"
    ) {
      return errorResponse(
        error.kind,
        409,
      );
    }

    if (
      error.kind ===
      "comic-not-found"
    ) {
      return errorResponse(
        error.kind,
        404,
      );
    }

    if (
      error.kind ===
      "category-not-found"
    ) {
      return errorResponse(
        error.kind,
        422,
      );
    }

    return errorResponse(
      error.kind,
      400,
    );
  }

  console.error(error);

  return errorResponse(
    "catalog-write-failed",
    500,
  );
}

async function authorize(
  request: NextRequest,
) {
  const authorization =
    await authorizeSharedCatalogMutationRequest(
      request,
    );

  if (!authorization.ok) {
    return {
      ok: false as const,
      response:
        errorResponse(
          authorization.kind,
          authorization.status,
        ),
    };
  }

  return {
    ok: true as const,
    currentUser:
      authorization.currentUser,
  };
}

export async function POST(
  request: NextRequest,
) {
  const access =
    await authorize(
      request,
    );

  if (!access.ok) {
    return access.response;
  }

  /*
   * Body parsing deliberately occurs only after
   * origin/session/permission authorization.
   */
  const body =
    await readCatalogComic(
      request,
    );

  if (!body.ok) {
    return body.response;
  }

  try {
    const created =
      await createSharedCatalogComic(
        body.comic,
        {
          userId:
            access.currentUser.id,
          role:
            access.currentUser.role,
        },
      );

    return jsonResponse(
      {
        ok: true,
        action: "create",
        comic: created,
      },
      201,
    );
  } catch (error) {
    return mutationErrorResponse(
      error,
    );
  }
}

export async function PATCH(
  request: NextRequest,
) {
  const access =
    await authorize(
      request,
    );

  if (!access.ok) {
    return access.response;
  }

  /*
   * Slug is the canonical identity in R6.
   * PATCH updates metadata but does not rename it.
   */
  const body =
    await readCatalogComic(
      request,
    );

  if (!body.ok) {
    return body.response;
  }

  try {
    const updated =
      await updateSharedCatalogComic(
        body.comic,
        {
          userId:
            access.currentUser.id,
          role:
            access.currentUser.role,
        },
      );

    return jsonResponse(
      {
        ok: true,
        action: "update",
        comic: updated,
      },
    );
  } catch (error) {
    return mutationErrorResponse(
      error,
    );
  }
}
