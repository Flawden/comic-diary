import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  authorizeSharedCatalogMutationRequest,
} from "@/modules/catalog/shared-catalog-authorization";

import {
  MAX_COVER_BYTES,
  MAX_COVER_REQUEST_BYTES,
  storeCover,
} from "@/modules/media/cover-storage";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

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

export async function POST(
  request: NextRequest,
) {
  /*
   * Authorization happens before any upload body is read.
   *
   * This preserves the existing shared-catalog
   * origin/session/permission boundary.
   */
  const authorization =
    await authorizeSharedCatalogMutationRequest(
      request,
    );

  if (!authorization.ok) {
    return errorResponse(
      authorization.kind,
      authorization.status,
    );
  }

  const contentType =
    request.headers
      .get("content-type")
      ?.toLowerCase();

  if (
    !contentType?.startsWith(
      "multipart/form-data",
    )
  ) {
    return errorResponse(
      "unsupported-media-type",
      415,
    );
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
        MAX_COVER_REQUEST_BYTES
    ) {
      return errorResponse(
        "request-too-large",
        413,
      );
    }
  }

  let form:
    FormData;

  try {
    form =
      await request.formData();
  } catch {
    return errorResponse(
      "invalid-multipart-body",
      400,
    );
  }

  const value =
    form.get(
      "file",
    );

  if (
    !(value instanceof File)
  ) {
    return errorResponse(
      "cover-file-required",
      400,
    );
  }

  if (
    value.size === 0 ||
    value.size >
      MAX_COVER_BYTES
  ) {
    return errorResponse(
      "cover-file-too-large",
      413,
    );
  }

  let bytes:
    Uint8Array;

  try {
    bytes =
      new Uint8Array(
        await value.arrayBuffer(),
      );
  } catch {
    return errorResponse(
      "cover-read-failed",
      400,
    );
  }

  try {
    const stored =
      await storeCover(
        bytes,
      );

    return jsonResponse(
      {
        ok: true,

        cover: {
          url:
            stored.publicUrl,

          contentType:
            stored.contentType,

          size:
            stored.size,
        },
      },
      201,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error.message ===
          "Unsupported cover format" ||
        error.message ===
          "Invalid cover size"
      )
    ) {
      return errorResponse(
        "unsupported-cover",
        415,
      );
    }

    console.error(
      error,
    );

    return errorResponse(
      "cover-storage-failed",
      500,
    );
  }
}
