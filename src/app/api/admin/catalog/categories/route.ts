import {
  type NextRequest,
  NextResponse,
} from "next/server";

import type {
  CatalogCategory,
} from "@/catalog/catalog-data";

import {
  authorizeSharedCatalogMutationRequest,
} from "@/modules/catalog/shared-catalog-authorization";
import {
  createSharedCatalogCategory,
  SharedCatalogMutationError,
  updateSharedCatalogCategory,
} from "@/modules/catalog/shared-catalog-mutations";

export const runtime =
  "nodejs";

const MAX_REQUEST_BYTES =
  32 * 1024;

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

function parseCatalogCategory(
  value: unknown,
): CatalogCategory | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.slug !==
      "string" ||
    typeof value.name !==
      "string" ||
    !(
      value.description === null ||
      typeof value.description ===
        "string"
    )
  ) {
    return null;
  }

  return {
    slug:
      value.slug,

    name:
      value.name,

    description:
      value.description,
  };
}

type BodyReadResult =
  | {
      ok: true;
      category: CatalogCategory;
    }
  | {
      ok: false;
      response: NextResponse;
    };

async function readCatalogCategory(
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

  const category =
    parseCatalogCategory(
      parsed,
    );

  if (!category) {
    return {
      ok: false,

      response:
        errorResponse(
          "invalid-category-request",
          400,
        ),
    };
  }

  return {
    ok: true,
    category,
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
      "category-already-exists"
    ) {
      return errorResponse(
        error.kind,
        409,
      );
    }

    if (
      error.kind ===
      "category-not-found"
    ) {
      return errorResponse(
        error.kind,
        404,
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
   * Authorization deliberately occurs before body parsing.
   */
  const body =
    await readCatalogCategory(
      request,
    );

  if (!body.ok) {
    return body.response;
  }

  try {
    const created =
      await createSharedCatalogCategory(
        body.category,
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
        category: created,
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
   * Slug is canonical category identity. PATCH uses it as
   * the selector and updates metadata only.
   */
  const body =
    await readCatalogCategory(
      request,
    );

  if (!body.ok) {
    return body.response;
  }

  try {
    const updated =
      await updateSharedCatalogCategory(
        body.category,
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
        category: updated,
      },
    );
  } catch (error) {
    return mutationErrorResponse(
      error,
    );
  }
}
