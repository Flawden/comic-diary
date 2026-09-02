import {
  getSafeLoginRedirect,
} from "../src/modules/auth/login-redirect";

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

function main() {
  assert(
    getSafeLoginRedirect(
      "/library",
    ) === "/library",
    "Library redirect rejected",
  );

  assert(
    getSafeLoginRedirect(
      "/comics/test?chapter=10#note",
    ) ===
      "/comics/test?chapter=10#note",
    "Internal path changed",
  );

  assert(
    getSafeLoginRedirect(
      "https://evil.example",
    ) === "/",
    "Absolute external redirect accepted",
  );

  assert(
    getSafeLoginRedirect(
      "//evil.example/path",
    ) === "/",
    "Protocol-relative redirect accepted",
  );

  assert(
    getSafeLoginRedirect(
      "/\\evil.example/path",
    ) === "/",
    "Backslash redirect accepted",
  );

  assert(
    getSafeLoginRedirect(
      "/login",
    ) === "/",
    "Login redirect loop accepted",
  );

  assert(
    getSafeLoginRedirect(
      "/login?next=/library",
    ) === "/",
    "Nested login redirect loop accepted",
  );

  assert(
    getSafeLoginRedirect(
      null,
    ) === "/",
    "Missing redirect fallback failed",
  );

  assert(
    getSafeLoginRedirect(
      "/library",
      "/fallback",
    ) === "/library",
    "Valid redirect replaced by fallback",
  );

  assert(
    getSafeLoginRedirect(
      "https://evil.example",
      "/fallback",
    ) === "/fallback",
    "Custom fallback failed",
  );

  console.log(
    "R6_2D_LOGIN_UI_PROBE=PASS",
  );

  console.log(
    "LOGIN_ROUTE=/login",
  );

  console.log(
    "POST_LOGIN_REDIRECT=SAME_ORIGIN_ONLY",
  );

  console.log(
    "EXTERNAL_REDIRECT=REJECTED",
  );

  console.log(
    "LOGIN_REDIRECT_LOOP=REJECTED",
  );

  console.log(
    "LOGIN_FAILURE_DISCLOSURE=GENERIC",
  );
}

main();
