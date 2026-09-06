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
  clearSessionCookie,
} from "@/modules/auth/session-cookie";

import {
  updateOwnDisplayName,
} from "@/modules/auth/profile-service";

export const dynamic =
  "force-dynamic";

export const runtime =
  "nodejs";

const MAX_PROFILE_BODY_BYTES =
  4 * 1024;

const allowedProfileKeys =
  new Set<string>([
    "displayName",
  ]);

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
      "application/json"
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
        MAX_PROFILE_BODY_BYTES
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
    MAX_PROFILE_BODY_BYTES
  ) {
    return jsonError(
      "request_too_large",
      413,
    );
  }

  let body:
    unknown;

  try {
    body =
      JSON.parse(
        rawBody,
      );
  } catch {
    return jsonError(
      "invalid_json",
      400,
    );
  }

  if (
    typeof body !==
      "object" ||
    body === null ||
    Array.isArray(
      body,
    )
  ) {
    return jsonError(
      "invalid_request",
      400,
    );
  }

  const record =
    body as Record<
      string,
      unknown
    >;

  const keys =
    Object.keys(
      record,
    );

  if (
    keys.length !== 1 ||
    keys.some(
      (key) =>
        !allowedProfileKeys.has(
          key,
        ),
    )
  ) {
    return jsonError(
      "invalid_request",
      400,
    );
  }

  const displayName =
    record.displayName;

  if (
    typeof displayName !==
      "string"
  ) {
    return jsonError(
      "invalid_request",
      400,
    );
  }

  const result =
    await updateOwnDisplayName(
      user.id,
      displayName,
    );

  if (!result.ok) {
    if (
      result.kind ===
        "account_unavailable"
    ) {
      const response =
        jsonError(
          result.kind,
          401,
        );

      clearSessionCookie(
        response,
      );

      return response;
    }

    return jsonError(
      result.kind,
      400,
    );
  }

  return NextResponse.json(
    {
      ok: true,

      user: {
        displayName:
          result.displayName,
      },
    },
    {
      status: 200,

      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
