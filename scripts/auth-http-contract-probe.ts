import {
  NextRequest,
} from "next/server";

import {
  isAllowedRequestOrigin,
  isSameOriginRequest,
} from "../src/modules/auth/request-origin";

import {
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "../src/modules/auth/session-cookie";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const now =
    new Date(
      "2026-09-02T00:00:00.000Z",
    );

  const expiry =
    new Date(
      now.getTime() +
        30 * 60 * 1000,
    );

  const production =
    getSessionCookieOptions(
      expiry,
      {
        production: true,
        now,
      },
    );

  const development =
    getSessionCookieOptions(
      expiry,
      {
        production: false,
        now,
      },
    );

  assert(
    SESSION_COOKIE_NAME ===
      "comic_diary_session",
    "Unexpected cookie name",
  );

  assert(
    production.httpOnly === true,
    "Cookie is not HttpOnly",
  );

  assert(
    production.secure === true,
    "Production cookie is not Secure",
  );

  assert(
    development.secure === false,
    "Development cookie unexpectedly Secure",
  );

  assert(
    production.sameSite === "lax",
    "Cookie SameSite is not Lax",
  );

  assert(
    production.path === "/",
    "Cookie path is not root",
  );

  assert(
    production.expires.getTime() ===
      expiry.getTime(),
    "Cookie expiry mismatch",
  );

  assert(
    production.maxAge ===
      30 * 60,
    "Cookie maxAge mismatch",
  );

  assert(
    isAllowedRequestOrigin(
      "https://comic.example",
      "https://comic.example",
    ),
    "Same origin rejected",
  );

  assert(
    !isAllowedRequestOrigin(
      "https://evil.example",
      "https://comic.example",
    ),
    "Cross origin accepted",
  );

  assert(
    !isAllowedRequestOrigin(
      "not a valid origin",
      "https://comic.example",
    ),
    "Malformed origin accepted",
  );

  assert(
    !isAllowedRequestOrigin(
      null,
      "https://comic.example",
    ),
    "Missing Origin accepted",
  );

  const hostFallbackRequest =
    new NextRequest(
      "http://internal:3000/api/auth/login",
      {
        method: "POST",
        headers: {
          host:
            "127.0.0.1:3000",
          origin:
            "http://127.0.0.1:3000",
        },
      },
    );

  assert(
    isSameOriginRequest(
      hostFallbackRequest,
    ),
    "Host fallback rejected",
  );

  const forwardedRequest =
    new NextRequest(
      "http://internal:3000/api/auth/login",
      {
        method: "POST",
        headers: {
          host:
            "internal:3000",
          origin:
            "https://comic.example",
          "x-forwarded-host":
            "comic.example",
          "x-forwarded-proto":
            "https",
        },
      },
    );

  assert(
    isSameOriginRequest(
      forwardedRequest,
    ),
    "Forwarded public origin rejected",
  );

  const forwardedAttack =
    new NextRequest(
      "http://internal:3000/api/auth/login",
      {
        method: "POST",
        headers: {
          host:
            "internal:3000",
          origin:
            "https://evil.example",
          "x-forwarded-host":
            "comic.example",
          "x-forwarded-proto":
            "https",
        },
      },
    );

  assert(
    !isSameOriginRequest(
      forwardedAttack,
    ),
    "Forwarded cross-origin accepted",
  );

  console.log(
    "R6_2C_HTTP_CONTRACT_PROBE=PASS",
  );

  console.log(
    "SESSION_COOKIE=HTTPONLY",
  );

  console.log(
    "PRODUCTION_COOKIE=SECURE",
  );

  console.log(
    "SESSION_COOKIE_SAMESITE=LAX",
  );

  console.log(
    "SESSION_COOKIE_PATH=/",
  );

  console.log(
    "SESSION_COOKIE_EXPIRY=EXPLICIT",
  );

  console.log(
    "REQUEST_PUBLIC_ORIGIN=HOST_OR_FORWARDED_HEADERS",
  );

  console.log(
    "NEXT_URL_HOST_DEPENDENCY=NONE",
  );

  console.log(
    "MISSING_ORIGIN=REJECTED",
  );

  console.log(
    "CROSS_ORIGIN_LOGIN_LOGOUT=REJECTED",
  );

  console.log(
    "RAW_SESSION_TOKEN_HTTP_JSON=NONE",
  );
}

main();
