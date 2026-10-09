import { isWorkType, isWorkFormat } from "@/modules/comics/work-metadata";
import { isSeriesStatus } from "@/modules/comics/series-status";
import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  getCurrentUser,
} from "@/modules/auth/request-identity";

import {
  isSameOriginRequest,
} from "@/modules/auth/request-origin";

import {
  createOwnPrivateTitle,
  deleteOwnPrivateTitle,
  PrivateTitleMutationError,
  updateOwnPrivateTitleMetadata,
} from "@/modules/private-catalog/private-title-mutations";

export const dynamic =
  "force-dynamic";

export const runtime =
  "nodejs";

const MAX_PRIVATE_TITLE_BODY_BYTES =
  16 * 1024;

function jsonError(
  error: string,
  status: number,
) {
  return NextResponse.json(
    {
      error,
    },
    {
      status,

      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}

function readMetadataInput(
  formData: URLSearchParams,
) {
  const title =
    formData.get(
      "title",
    );

  const sourceUrl =
    formData.get(
      "sourceUrl",
    );

  const totalChaptersRaw =
    formData.get(
      "totalChapters",
    );

  if (
    title === null ||
    sourceUrl === null
  ) {
    return null;
  }

  let totalChapters:
    number | null =
    null;

  if (
    totalChaptersRaw !==
      null &&
    totalChaptersRaw.trim() !==
      ""
  ) {
    totalChapters =
      Number(
        totalChaptersRaw,
      );
  }

  const workType = formData.get("workType");
  const workFormat = formData.get("workFormat");
  if (workType !== null && !isWorkType(workType)) return null;
  if (workFormat !== null && !isWorkFormat(workFormat)) return null;
  const seriesStatus = formData.get("seriesStatus");
  if (seriesStatus !== null && !isSeriesStatus(seriesStatus)) return null;
  return {
    workType: workType ?? undefined,
    workFormat: workFormat ?? undefined,
    seriesStatus: seriesStatus ?? undefined,
    title,
    sourceUrl,
    totalChapters,
  };
}

export async function POST(
  request: NextRequest,
) {
  if (
    !isSameOriginRequest(
      request,
    )
  ) {
    return jsonError(
      "forbidden_origin",
      403,
    );
  }

  const user =
    await getCurrentUser();

  if (!user) {
    return jsonError(
      "unauthorized",
      401,
    );
  }

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
    "application/x-www-form-urlencoded"
  ) {
    return jsonError(
      "unsupported_media_type",
      415,
    );
  }

  const declaredLength =
    request.headers.get(
      "content-length",
    );

  if (declaredLength) {
    const parsedLength =
      Number(
        declaredLength,
      );

    if (
      Number.isFinite(
        parsedLength,
      ) &&
      parsedLength >
        MAX_PRIVATE_TITLE_BODY_BYTES
    ) {
      return jsonError(
        "request_too_large",
        413,
      );
    }
  }

  const rawBody =
    await request.text();

  if (
    Buffer.byteLength(
      rawBody,
      "utf8",
    ) >
    MAX_PRIVATE_TITLE_BODY_BYTES
  ) {
    return jsonError(
      "request_too_large",
      413,
    );
  }

  const formData =
    new URLSearchParams(
      rawBody,
    );

  const intent =
    formData.get(
      "intent",
    );

  try {
    if (
      intent ===
      "create"
    ) {
      const input =
        readMetadataInput(
          formData,
        );

      if (!input) {
        return jsonError(
          "invalid_request",
          400,
        );
      }

      const created =
        await createOwnPrivateTitle(
          user.id,
          input,
        );

      return new Response(
        null,
        {
          status:
            303,

          headers: {
            Location:
              `/comics/${encodeURIComponent(
                created.slug,
              )}`,
          },
        },
      );
    }

    if (
      intent ===
      "edit"
    ) {
      const comicId =
        Number(
          formData.get(
            "comicId",
          ),
        );

      const input =
        readMetadataInput(
          formData,
        );

      if (!input) {
        return jsonError(
          "invalid_request",
          400,
        );
      }

      const updated =
        await updateOwnPrivateTitleMetadata(
          user.id,
          comicId,
          input,
        );

      return new Response(
        null,
        {
          status:
            303,

          headers: {
            Location:
              `/comics/${encodeURIComponent(
                updated.slug,
              )}`,
          },
        },
      );
    }

    if (
      intent ===
      "delete"
    ) {
      const comicId =
        Number(
          formData.get(
            "comicId",
          ),
        );

      await deleteOwnPrivateTitle(
        user.id,
        comicId,
      );

      return new Response(
        null,
        {
          status:
            303,

          headers: {
            Location:
              "/library",
          },
        },
      );
    }

    return jsonError(
      "invalid_request",
      400,
    );
  } catch (error) {
    if (
      error instanceof
      PrivateTitleMutationError
    ) {
      if (
        error.kind ===
        "entitlement-required"
      ) {
        return jsonError(
          "private_catalog_required",
          403,
        );
      }

      if (
        error.kind ===
        "private-title-not-found"
      ) {
        return jsonError(
          "private_title_not_found",
          404,
        );
      }

      return jsonError(
        error.kind.replaceAll(
          "-",
          "_",
        ),
        400,
      );
    }

    console.error(
      error,
    );

    return jsonError(
      "private_title_mutation_failed",
      500,
    );
  }
}
