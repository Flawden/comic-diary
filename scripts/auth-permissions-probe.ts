import {
  userRole,
} from "../src/db/schema";

import {
  AUTH_PERMISSIONS,
  PermissionDeniedError,
  getRolePermissions,
  hasPermission,
  requirePermission,
} from "../src/modules/auth/permissions";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  assert(
    JSON.stringify(
      userRole.enumValues,
    ) ===
      JSON.stringify([
        "USER",
        "EDITOR",
        "ADMIN",
      ]),
    "Unexpected user_role values",
  );

  assert(
    AUTH_PERMISSIONS.length === 6,
    "Unexpected permission count",
  );

  for (
    const role
    of [
      "USER",
      "EDITOR",
      "ADMIN",
    ] as const
  ) {
    assert(
      hasPermission(
        role,
        "READ_OWN_LIBRARY",
      ),
      `${role} cannot read own library`,
    );

    assert(
      hasPermission(
        role,
        "WRITE_OWN_LIBRARY",
      ),
      `${role} cannot write own library`,
    );
  }

  assert(
    !hasPermission(
      "USER",
      "EDIT_SHARED_CATALOG",
    ),
    "USER can edit shared catalog",
  );

  assert(
    hasPermission(
      "EDITOR",
      "EDIT_SHARED_CATALOG",
    ),
    "EDITOR cannot edit shared catalog",
  );

  assert(
    hasPermission(
      "ADMIN",
      "EDIT_SHARED_CATALOG",
    ),
    "ADMIN cannot edit shared catalog",
  );

  for (
    const permission
    of [
      "ADMIN_USERS",
      "ADMIN_SECURITY",
      "RUN_BULK_IMPORT",
    ] as const
  ) {
    assert(
      !hasPermission(
        "USER",
        permission,
      ),
      `USER unexpectedly has ${permission}`,
    );

    assert(
      !hasPermission(
        "EDITOR",
        permission,
      ),
      `EDITOR unexpectedly has ${permission}`,
    );

    assert(
      hasPermission(
        "ADMIN",
        permission,
      ),
      `ADMIN lacks ${permission}`,
    );
  }

  requirePermission(
    "EDITOR",
    "EDIT_SHARED_CATALOG",
  );

  let denied = false;

  try {
    requirePermission(
      "EDITOR",
      "RUN_BULK_IMPORT",
    );
  } catch (error) {
    denied =
      error instanceof
        PermissionDeniedError;
  }

  assert(
    denied,
    "EDITOR bulk-import denial missing",
  );

  assert(
    getRolePermissions(
      "USER",
    ).length === 2,
    "Unexpected USER permission set",
  );

  assert(
    getRolePermissions(
      "EDITOR",
    ).length === 3,
    "Unexpected EDITOR permission set",
  );

  assert(
    getRolePermissions(
      "ADMIN",
    ).length === 6,
    "Unexpected ADMIN permission set",
  );

  console.log(
    "R6_3D1_PERMISSION_PROBE=PASS",
  );

  console.log(
    "ROLE_ENUM=USER,EDITOR,ADMIN",
  );

  console.log(
    "USER_SHARED_CATALOG=DENIED",
  );

  console.log(
    "EDITOR_SHARED_CATALOG=ALLOWED",
  );

  console.log(
    "EDITOR_ADMIN_USERS=DENIED",
  );

  console.log(
    "EDITOR_ADMIN_SECURITY=DENIED",
  );

  console.log(
    "EDITOR_BULK_IMPORT=DENIED",
  );

  console.log(
    "ADMIN_SHARED_CATALOG=ALLOWED",
  );

  console.log(
    "ADMIN_BULK_IMPORT=ALLOWED",
  );

  console.log(
    "ROLE_CHECK_POLICY=PERMISSION_MATRIX",
  );
}

main();
