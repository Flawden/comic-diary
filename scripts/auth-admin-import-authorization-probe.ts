import {
  evaluateAdminImportPagePolicy,
  evaluateAdminImportRequestPolicy,
} from "../src/modules/admin-import/admin-import-policy";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const crossOriginAdmin =
  evaluateAdminImportRequestPolicy({
    sameOrigin: false,
    userRole: "ADMIN",
    enabled: true,
  });

assert(
  !crossOriginAdmin.ok &&
    crossOriginAdmin.status === 403 &&
    crossOriginAdmin.kind ===
      "origin-not-allowed",
  "Cross-origin ADMIN request was not denied",
);

const anonymous =
  evaluateAdminImportRequestPolicy({
    sameOrigin: true,
    userRole: null,
    enabled: true,
  });

assert(
  !anonymous.ok &&
    anonymous.status === 401,
  "Anonymous API request was not denied",
);

const user =
  evaluateAdminImportRequestPolicy({
    sameOrigin: true,
    userRole: "USER",
    enabled: true,
  });

assert(
  !user.ok &&
    user.status === 403,
  "USER unexpectedly has bulk-import access",
);

const editor =
  evaluateAdminImportRequestPolicy({
    sameOrigin: true,
    userRole: "EDITOR",
    enabled: true,
  });

assert(
  !editor.ok &&
    editor.status === 403,
  "EDITOR unexpectedly has bulk-import access",
);

const admin =
  evaluateAdminImportRequestPolicy({
    sameOrigin: true,
    userRole: "ADMIN",
    enabled: true,
  });

assert(
  admin.ok,
  "ADMIN lacks bulk-import access",
);

const disabledAdmin =
  evaluateAdminImportRequestPolicy({
    sameOrigin: true,
    userRole: "ADMIN",
    enabled: false,
  });

assert(
  !disabledAdmin.ok &&
    disabledAdmin.status === 503 &&
    disabledAdmin.kind ===
      "admin-unavailable",
  "Kill-switch did not deny ADMIN",
);

const pageAnonymous =
  evaluateAdminImportPagePolicy({
    userRole: null,
    enabled: true,
  });

assert(
  !pageAnonymous.ok &&
    pageAnonymous.status === 401,
  "Anonymous page access was not denied",
);

const pageUser =
  evaluateAdminImportPagePolicy({
    userRole: "USER",
    enabled: true,
  });

assert(
  !pageUser.ok &&
    pageUser.status === 403,
  "USER page access was not denied",
);

const pageEditor =
  evaluateAdminImportPagePolicy({
    userRole: "EDITOR",
    enabled: true,
  });

assert(
  !pageEditor.ok &&
    pageEditor.status === 403,
  "EDITOR page access was not denied",
);

const pageAdmin =
  evaluateAdminImportPagePolicy({
    userRole: "ADMIN",
    enabled: true,
  });

assert(
  pageAdmin.ok,
  "ADMIN page access denied",
);

console.log(
  "R6_3D2_ADMIN_IMPORT_AUTHORIZATION_PROBE=PASS",
);

console.log("CROSS_ORIGIN_ADMIN=403");
console.log("ANONYMOUS_API=401");
console.log("USER_API=403");
console.log("EDITOR_API=403");
console.log("ADMIN_API=ALLOWED");
console.log("ADMIN_DISABLED=503");
console.log("ANONYMOUS_PAGE=LOGIN_REQUIRED");
console.log("USER_PAGE=FORBIDDEN");
console.log("EDITOR_PAGE=FORBIDDEN");
console.log("ADMIN_PAGE=ALLOWED");
console.log("AUTH_BOUNDARY=COMIC_DIARY_SESSION");
console.log(
  "BULK_IMPORT_PERMISSION=RUN_BULK_IMPORT",
);
