import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  consumeAuthRateLimit,
} from "@/modules/auth/auth-rate-limit";

import {
  changeOwnPassword,
} from "@/modules/auth/password-change-service";

import {
  getCurrentUser,
} from "@/modules/auth/request-identity";

import {
  isSameOriginRequest,
} from "@/modules/auth/request-origin";

import {
  clearSessionCookie,
  setSessionCookie,
} from "@/modules/auth/session-cookie";

export const dynamic =
  "force-dynamic";

export const runtime =
  "nodejs";

const MAX_PASSWORD_CHANGE_BODY_BYTES =
  16 * 1024;

const ACCOUNT_PASSWORD_RATE_LIMIT_SCOPE =
  "account-password-user-v1";

const ACCOUNT_PASSWORD_RATE_LIMIT_MAX_REQUESTS =
  10;

const ACCOUNT_PASSWORD_RATE_LIMIT_WINDOW_MS =
  15 * 60 * 1000;

const allowedPasswordChangeKeys =
  new Set<string>([
    "currentPassword",
    "newPassword",
    "newPasswordConfirm",
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
        MAX_PASSWORD_CHANGE_BODY_BYTES
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
    MAX_PASSWORD_CHANGE_BODY_BYTES
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
    keys.some(
      (key) =>
        !allowedPasswordChangeKeys.has(
          key,
        ),
    )
  ) {
    return jsonError(
      "invalid_request",
      400,
    );
  }

  const currentPassword =
    record.currentPassword;

  const newPassword =
    record.newPassword;

  const newPasswordConfirm =
    record.newPasswordConfirm;

  if (
    typeof currentPassword !==
      "string" ||
    typeof newPassword !==
      "string" ||
    typeof newPasswordConfirm !==
      "string" ||
    currentPassword.length === 0
  ) {
    return jsonError(
      "invalid_request",
      400,
    );
  }

  if (
    newPassword !==
      newPasswordConfirm
  ) {
    return jsonError(
      "password_mismatch",
      400,
    );
  }

  let rateLimit;

  try {
    rateLimit =
      await consumeAuthRateLimit({
        scope:
          ACCOUNT_PASSWORD_RATE_LIMIT_SCOPE,

        identity:
          String(
            user.id,
          ),

        maxRequests:
          ACCOUNT_PASSWORD_RATE_LIMIT_MAX_REQUESTS,

        windowMs:
          ACCOUNT_PASSWORD_RATE_LIMIT_WINDOW_MS,
      });
  } catch {
    return jsonError(
      "rate_limit_unavailable",
      503,
    );
  }

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "rate_limited",
      },
      {
        status:
          429,

        headers: {
          "Cache-Control":
            "no-store",

          "Retry-After":
            String(
              rateLimit.retryAfterSeconds,
            ),
        },
      },
    );
  }

  const result =
    await changeOwnPassword(
      user.id,
      currentPassword,
      newPassword,
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

    if (
      result.kind ===
        "invalid_current_password"
    ) {
      return jsonError(
        result.kind,
        401,
      );
    }

    return jsonError(
      result.kind,
      400,
    );
  }

  const response =
    NextResponse.json(
      {
        ok: true,

        sessionsRevoked:
          result.sessionsRevoked,
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );

  setSessionCookie(
    response,
    result.session.token,
    result.session.expiresAt,
  );

  return response;
}
