import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  authorizeSharedCatalogMutationRequest,
} from "@/modules/catalog/shared-catalog-authorization";

import {
  archiveSharedCatalogChapter,
  createSharedCatalogChapter,
  reorderSharedCatalogChapter,
  SharedChapterMutationError,
  updateSharedCatalogChapter,
} from "@/modules/catalog/shared-chapter-mutations";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const MAX_REQUEST_BYTES =
  32 * 1024;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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
    !Array.isArray(
      value,
    )
  );
}

function parsePositiveId(
  value: unknown,
) {
  if (
    typeof value ===
    "number"
  ) {
    return (
      Number.isSafeInteger(
        value,
      ) &&
      value > 0
    )
      ? value
      : null;
  }

  if (
    typeof value !==
      "string" ||
    !/^[1-9]\d*$/.test(
      value,
    )
  ) {
    return null;
  }

  const parsed =
    Number(
      value,
    );

  return (
    Number.isSafeInteger(
      parsed,
    )
  )
    ? parsed
    : null;
}

function parseNullableString(
  value: unknown,
) {
  return (
    value === null ||
    typeof value ===
      "string"
  )
    ? value
    : undefined;
}

function parseReleasedAt(
  value: unknown,
):
  | Date
  | null
  | undefined {
  if (value === null) {
    return null;
  }

  if (
    typeof value !==
    "string"
  ) {
    return undefined;
  }

  const parsed =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return undefined;
  }

  return parsed;
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

async function readJson(
  request: NextRequest,
) {
  const contentType =
    request.headers
      .get(
        "content-type",
      )
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();

  if (
    contentType !==
      "application/json"
  ) {
    return {
      ok: false as const,

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
    const length =
      Number(
        rawLength,
      );

    if (
      Number.isFinite(
        length,
      ) &&
      length >
        MAX_REQUEST_BYTES
    ) {
      return {
        ok: false as const,

        response:
          errorResponse(
            "request-too-large",
            413,
          ),
      };
    }
  }

  const rawBody =
    await request.text();

  if (
    Buffer.byteLength(
      rawBody,
      "utf8",
    ) >
    MAX_REQUEST_BYTES
  ) {
    return {
      ok: false as const,

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
        rawBody,
      );
  } catch {
    return {
      ok: false as const,

      response:
        errorResponse(
          "invalid-json",
          400,
        ),
    };
  }

  if (
    !isRecord(
      parsed,
    )
  ) {
    return {
      ok: false as const,

      response:
        errorResponse(
          "invalid-chapter-request",
          400,
        ),
    };
  }

  return {
    ok: true as const,
    body:
      parsed,
  };
}

function parseMetadata(
  body: Record<string, unknown>,
) {
  if (
    typeof body.displayCode !==
      "string"
  ) {
    return null;
  }

  const title =
    parseNullableString(
      body.title,
    );

  const sourceUrl =
    parseNullableString(
      body.sourceUrl,
    );

  const releasedAt =
    parseReleasedAt(
      body.releasedAt,
    );

  if (
    title === undefined ||
    sourceUrl === undefined ||
    releasedAt === undefined
  ) {
    return null;
  }

  if (
    body.status !==
      "SCHEDULED" &&
    body.status !==
      "RELEASED"
  ) {
    return null;
  }

  return {
    displayCode:
      body.displayCode,

    title,

    sourceUrl,

    status:
      body.status,

    releasedAt,
  } as const;
}

function mutationErrorResponse(
  error: unknown,
) {
  if (
    error instanceof
      SharedChapterMutationError
  ) {
    switch (
      error.kind
    ) {
      case "comic-not-found":
      case "chapter-not-found":
        return errorResponse(
          error.kind,
          404,
        );

      case "chapter-archived":
      case "chapter-display-code-conflict":
        return errorResponse(
          error.kind,
          409,
        );

      case "invalid-chapter":
        return errorResponse(
          error.kind,
          400,
        );
    }
  }

  console.error(
    "Shared chapter API failed",
    error,
  );

  return errorResponse(
    "chapter-write-failed",
    500,
  );
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: RouteContext,
) {
  const access =
    await authorize(
      request,
    );

  if (!access.ok) {
    return access.response;
  }

  const {
    id: rawComicId,
  } = await params;

  const comicId =
    parsePositiveId(
      rawComicId,
    );

  if (comicId === null) {
    return errorResponse(
      "invalid-comic-id",
      400,
    );
  }

  /*
   * Authorization deliberately precedes body parsing.
   */
  const parsed =
    await readJson(
      request,
    );

  if (!parsed.ok) {
    return parsed.response;
  }

  const metadata =
    parseMetadata(
      parsed.body,
    );

  const sortOrder =
    parsed.body.sortOrder;

  if (
    !metadata ||
    typeof sortOrder !==
      "number" ||
    !Number.isSafeInteger(
      sortOrder,
    )
  ) {
    return errorResponse(
      "invalid-chapter-request",
      400,
    );
  }

  try {
    const chapter =
      await createSharedCatalogChapter(
        comicId,
        {
          ...metadata,
          sortOrder,
        },
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
        action:
          "create",
        chapter,
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
  {
    params,
  }: RouteContext,
) {
  const access =
    await authorize(
      request,
    );

  if (!access.ok) {
    return access.response;
  }

  const {
    id: rawComicId,
  } = await params;

  const comicId =
    parsePositiveId(
      rawComicId,
    );

  if (comicId === null) {
    return errorResponse(
      "invalid-comic-id",
      400,
    );
  }

  /*
   * Authorization deliberately precedes body parsing.
   */
  const parsed =
    await readJson(
      request,
    );

  if (!parsed.ok) {
    return parsed.response;
  }

  const chapterId =
    parsePositiveId(
      parsed.body.chapterId,
    );

  if (chapterId === null) {
    return errorResponse(
      "invalid-chapter-id",
      400,
    );
  }

  const intent =
    parsed.body.intent;

  try {
    if (
      intent ===
      "update"
    ) {
      const metadata =
        parseMetadata(
          parsed.body,
        );

      if (!metadata) {
        return errorResponse(
          "invalid-chapter-request",
          400,
        );
      }

      const chapter =
        await updateSharedCatalogChapter(
          comicId,
          chapterId,
          metadata,
          {
            userId:
              access.currentUser.id,

            role:
              access.currentUser.role,
          },
        );

      return jsonResponse({
        ok: true,
        action:
          "update",
        chapter,
      });
    }

    if (
      intent ===
      "reorder"
    ) {
      const sortOrder =
        parsed.body.sortOrder;

      if (
        typeof sortOrder !==
          "number" ||
        !Number.isSafeInteger(
          sortOrder,
        )
      ) {
        return errorResponse(
          "invalid-chapter-request",
          400,
        );
      }

      const chapter =
        await reorderSharedCatalogChapter(
          comicId,
          chapterId,
          sortOrder,
          {
            userId:
              access.currentUser.id,

            role:
              access.currentUser.role,
          },
        );

      return jsonResponse({
        ok: true,
        action:
          "reorder",
        chapter,
      });
    }

    if (
      intent ===
      "archive"
    ) {
      const chapter =
        await archiveSharedCatalogChapter(
          comicId,
          chapterId,
          {
            userId:
              access.currentUser.id,

            role:
              access.currentUser.role,
          },
        );

      return jsonResponse({
        ok: true,
        action:
          "archive",
        chapter,
      });
    }

    return errorResponse(
      "invalid-chapter-intent",
      400,
    );
  } catch (error) {
    return mutationErrorResponse(
      error,
    );
  }
}
