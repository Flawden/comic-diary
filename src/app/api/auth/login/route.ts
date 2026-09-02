import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  authenticatePasswordLogin,
} from "@/modules/auth/login-service";

import {
  isSameOriginRequest,
} from "@/modules/auth/request-origin";

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

const MAX_LOGIN_BODY_BYTES =
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

  const rawBody =
    await request.text();

  if (
    Buffer.byteLength(
      rawBody,
      "utf8",
    ) >
    MAX_LOGIN_BODY_BYTES
  ) {
    return jsonError(
      "request_too_large",
      413,
    );
  }

  let body: unknown;

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
    Array.isArray(body)
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

  const email =
    record.email;

  const password =
    record.password;

  if (
    typeof email !==
      "string" ||
    typeof password !==
      "string" ||
    email.length > 320 ||
    password.length === 0
  ) {
    return jsonError(
      "invalid_request",
      400,
    );
  }

  const user =
    await authenticatePasswordLogin(
      email,
      password,
    );

  if (!user) {
    return jsonError(
      "invalid_credentials",
      401,
    );
  }

  const session =
    await createUserSession(
      user.id,
    );

  const response =
    NextResponse.json(
      {
        ok: true,

        user: {
          id:
            user.id,

          email:
            user.email,

          displayName:
            user.displayName,

          role:
            user.role,
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

  setSessionCookie(
    response,
    session.token,
    session.expiresAt,
  );

  return response;
}
