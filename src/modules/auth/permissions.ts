import {
  userRole,
} from "@/db/schema";

export type UserRole =
  (typeof userRole.enumValues)[number];

export const AUTH_PERMISSIONS = [
  "READ_OWN_LIBRARY",
  "WRITE_OWN_LIBRARY",
  "EDIT_SHARED_CATALOG",
  "ADMIN_USERS",
  "ADMIN_SECURITY",
  "RUN_BULK_IMPORT",
] as const;

export type AuthPermission =
  (typeof AUTH_PERMISSIONS)[number];

const ROLE_PERMISSIONS = {
  USER: [
    "READ_OWN_LIBRARY",
    "WRITE_OWN_LIBRARY",
  ],

  EDITOR: [
    "READ_OWN_LIBRARY",
    "WRITE_OWN_LIBRARY",
    "EDIT_SHARED_CATALOG",
  ],

  ADMIN: [
    "READ_OWN_LIBRARY",
    "WRITE_OWN_LIBRARY",
    "EDIT_SHARED_CATALOG",
    "ADMIN_USERS",
    "ADMIN_SECURITY",
    "RUN_BULK_IMPORT",
  ],
} as const satisfies Record<
  UserRole,
  readonly AuthPermission[]
>;

export class PermissionDeniedError
  extends Error {
  constructor(
    readonly permission:
      AuthPermission,
  ) {
    super(
      `Permission denied: ${permission}`,
    );

    this.name =
      "PermissionDeniedError";
  }
}

export function getRolePermissions(
  role: UserRole,
): readonly AuthPermission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(
  role: UserRole,
  permission: AuthPermission,
): boolean {
  return getRolePermissions(
    role,
  ).includes(
    permission,
  );
}

export function requirePermission(
  role: UserRole,
  permission: AuthPermission,
): void {
  if (
    !hasPermission(
      role,
      permission,
    )
  ) {
    throw new PermissionDeniedError(
      permission,
    );
  }
}
