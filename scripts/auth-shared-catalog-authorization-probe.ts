import {
  hasPermission,
} from "../src/modules/auth/permissions";

import {
  evaluateSharedCatalogMutationPolicy,
} from "../src/modules/catalog/shared-catalog-policy";

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

const crossOriginAdmin =
  evaluateSharedCatalogMutationPolicy({
    sameOrigin: false,
    userRole: "ADMIN",
  });

assert(
  !crossOriginAdmin.ok &&
    crossOriginAdmin.status ===
      403 &&
    crossOriginAdmin.kind ===
      "origin-not-allowed",
  "Cross-origin ADMIN was not denied",
);

const anonymous =
  evaluateSharedCatalogMutationPolicy({
    sameOrigin: true,
    userRole: null,
  });

assert(
  !anonymous.ok &&
    anonymous.status ===
      401,
  "Anonymous mutation was not denied",
);

const user =
  evaluateSharedCatalogMutationPolicy({
    sameOrigin: true,
    userRole: "USER",
  });

assert(
  !user.ok &&
    user.status ===
      403,
  "USER unexpectedly edits shared catalog",
);

const editor =
  evaluateSharedCatalogMutationPolicy({
    sameOrigin: true,
    userRole: "EDITOR",
  });

assert(
  editor.ok,
  "EDITOR lacks shared catalog permission",
);

const admin =
  evaluateSharedCatalogMutationPolicy({
    sameOrigin: true,
    userRole: "ADMIN",
  });

assert(
  admin.ok,
  "ADMIN lacks shared catalog permission",
);

assert(
  hasPermission(
    "EDITOR",
    "EDIT_SHARED_CATALOG",
  ),
  "EDITOR permission matrix mismatch",
);

assert(
  !hasPermission(
    "EDITOR",
    "RUN_BULK_IMPORT",
  ),
  "EDITOR unexpectedly has bulk-import authority",
);

console.log(
  "R6_3D3_SHARED_CATALOG_AUTHORIZATION_PROBE=PASS",
);

console.log("CROSS_ORIGIN_ADMIN=403");
console.log("ANONYMOUS_API=401");
console.log("USER_API=403");
console.log("EDITOR_API=ALLOWED");
console.log("ADMIN_API=ALLOWED");
console.log(
  "SHARED_CATALOG_PERMISSION=EDIT_SHARED_CATALOG",
);
console.log(
  "EDITOR_BULK_IMPORT=DENIED",
);
