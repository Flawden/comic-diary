import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  isSameOriginRequest,
} from "@/modules/auth/request-origin";

import {
  clearSessionCookie,
  SESSION_COOKIE_NAME,
} from "@/modules/auth/session-cookie";

import {
  revokeSession,
} from "@/modules/auth/session-service";

export const dynamic =
  "force-dynamic";

export const runtime =
  "nodejs";

export async function POST(
  request: NextRequest,
) {
  if (
    !isSameOriginRequest(
      request,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "forbidden_origin",
      },
      {
        status: 403,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const token =
    request.cookies.get(
      SESSION_COOKIE_NAME,
    )?.value;

  if (token) {
    await revokeSession(
      token,
    );
  }

  /*
   * Logout is intentionally idempotent.
   *
   * A missing/already-revoked session still
   * produces the same successful result.
   */
  const response =
    new NextResponse(
      null,
      {
        status: 204,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );

  clearSessionCookie(
    response,
  );

  return response;
}
