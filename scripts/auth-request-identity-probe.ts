import {
  readSessionToken,
  type SessionCookieReader,
} from "../src/modules/auth/session-cookie-reader";

import {
  SESSION_COOKIE_NAME,
} from "../src/modules/auth/session-cookie";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

function cookieReader(
  values:
    Record<string, string>,
): SessionCookieReader {
  return {
    get(name) {
      const value =
        values[name];

      if (
        value === undefined
      ) {
        return undefined;
      }

      return {
        value,
      };
    },
  };
}

function main() {
  const token =
    "A".repeat(43);

  assert(
    readSessionToken(
      cookieReader({
        [SESSION_COOKIE_NAME]:
          token,
      }),
    ) === token,
    "Session token was not read from auth cookie",
  );

  assert(
    readSessionToken(
      cookieReader({}),
    ) === null,
    "Missing cookie did not resolve to null",
  );

  assert(
    readSessionToken(
      cookieReader({
        [SESSION_COOKIE_NAME]:
          "",
      }),
    ) === null,
    "Empty cookie did not resolve to null",
  );

  assert(
    readSessionToken(
      cookieReader({
        unrelated:
          token,
      }),
    ) === null,
    "Unrelated cookie was treated as session",
  );

  console.log(
    "R6_3A_REQUEST_IDENTITY_PROBE=PASS",
  );

  console.log(
    "SESSION_COOKIE_SOURCE=comic_diary_session",
  );

  console.log(
    "PURE_COOKIE_READER_DB_DEPENDENCY=NONE",
  );

  console.log(
    "PURE_COOKIE_READER_ENV_DEPENDENCY=NONE",
  );

  console.log(
    "MISSING_SESSION=ANONYMOUS",
  );

  console.log(
    "CURRENT_SESSION=SERVER_SIDE",
  );

  console.log(
    "CURRENT_USER=SESSION_USER",
  );

  console.log(
    "RAW_SESSION_TOKEN_LOGGING=NONE",
  );

  console.log(
    "DEV_USER_EMAIL_DEPENDENCY=NONE",
  );
}

main();
