import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  isSameOriginRequest,
} from "@/modules/auth/request-origin";

import {
  readTrustedClientIp,
} from "@/modules/auth/client-ip";

import {
  consumeRegistrationRateLimit,
} from "@/modules/auth/auth-rate-limit";

import {
  registerPasswordUser,
} from "@/modules/auth/registration-service";

import {
  createUserSession,
} from "@/modules/auth/session-service";

import {
  setSessionCookie,
} from "@/modules/auth/session-cookie";

export const dynamic =
  "force-dynamic";

export const runtime =
  "nodejs";

const MAX_REGISTRATION_BODY_BYTES =
  16 * 1024;

const allowedRegistrationKeys =
  new Set<string>([
    "email",
    "password",
    "passwordConfirm",
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

  const clientIp =
    readTrustedClientIp(
      request.headers,
    );

  if (!clientIp) {
    return jsonError(
      "rate_limit_identity_unavailable",
      503,
    );
  }

  let rateLimit;

  try {
    rateLimit =
      await consumeRegistrationRateLimit(
        clientIp,
      );
  } catch {
    /*
     * Public registration fails closed when the shared
     * anti-abuse backend is unavailable. It must never
     * silently fall back to an unprotected signup path.
     */
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
        MAX_REGISTRATION_BODY_BYTES
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
    MAX_REGISTRATION_BODY_BYTES
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
        !allowedRegistrationKeys.has(
          key,
        ),
    )
  ) {
    return jsonError(
      "invalid_request",
      400,
    );
  }

  const email =
    record.email;

  const password =
    record.password;

  const passwordConfirm =
    record.passwordConfirm;

  if (
    typeof email !==
      "string" ||
    typeof password !==
      "string" ||
    typeof passwordConfirm !==
      "string" ||
    email.length > 320
  ) {
    return jsonError(
      "invalid_request",
      400,
    );
  }

  if (
    password !==
      passwordConfirm
  ) {
    return jsonError(
      "password_mismatch",
      400,
    );
  }

  const registration =
    await registerPasswordUser(
      email,
      password,
    );

  if (!registration.ok) {
    if (
      registration.kind ===
        "email_unavailable"
    ) {
      return jsonError(
        registration.kind,
        409,
      );
    }

    return jsonError(
      registration.kind,
      400,
    );
  }

  /*
   * Registration immediately reuses the established R6
   * login/session stack. No second cookie or identity
   * mechanism is introduced.
   */
  const session =
    await createUserSession(
      registration.user.id,
    );

  const response =
    NextResponse.json(
      {
        ok: true,

        user: {
          id:
            registration.user.id,

          email:
            registration.user.email,

          displayName:
            registration.user.displayName,

          role:
            registration.user.role,
        },
      },
      {
        status: 201,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );

  setSessionCookie(
    response,
    session.token,
    session.expiresAt,
  );

  return response;
}
