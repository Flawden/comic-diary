import {
  evaluateAdminAccountRequestPolicy,
} from "../src/modules/auth/admin-account-policy";

import {
  hasPermission,
} from "../src/modules/auth/permissions";

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

const crossOrigin =
  evaluateAdminAccountRequestPolicy({
    sameOrigin: false,
    userRole: "ADMIN",
  });

assert(
  !crossOrigin.ok &&
    crossOrigin.status ===
      403 &&
    crossOrigin.kind ===
      "origin-not-allowed",
  "Cross-origin ADMIN was not rejected",
);

const anonymous =
  evaluateAdminAccountRequestPolicy({
    sameOrigin: true,
    userRole: null,
  });

assert(
  !anonymous.ok &&
    anonymous.status ===
      401,
  "Anonymous account administration was not rejected",
);

const user =
  evaluateAdminAccountRequestPolicy({
    sameOrigin: true,
    userRole: "USER",
  });

assert(
  !user.ok &&
    user.status ===
      403,
  "USER unexpectedly administers accounts",
);

const editor =
  evaluateAdminAccountRequestPolicy({
    sameOrigin: true,
    userRole: "EDITOR",
  });

assert(
  !editor.ok &&
    editor.status ===
      403,
  "EDITOR unexpectedly administers accounts",
);

const admin =
  evaluateAdminAccountRequestPolicy({
    sameOrigin: true,
    userRole: "ADMIN",
  });

assert(
  admin.ok,
  "ADMIN lacks account administration authority",
);

assert(
  !hasPermission(
    "EDITOR",
    "ADMIN_USERS",
  ),
  "EDITOR permission matrix mismatch",
);

assert(
  hasPermission(
    "ADMIN",
    "ADMIN_USERS",
  ),
  "ADMIN permission matrix mismatch",
);

console.log(
  "R6_4C_ADMIN_ACCOUNT_HTTP_AUTHORIZATION_PROBE=PASS",
);

console.log(
  "CROSS_ORIGIN_ADMIN=403",
);

console.log(
  "ANONYMOUS_API=401",
);

console.log(
  "USER_API=403",
);

console.log(
  "EDITOR_API=403",
);

console.log(
  "ADMIN_API=ALLOWED",
);

console.log(
  "AUTHORIZATION_PERMISSION=ADMIN_USERS",
);
