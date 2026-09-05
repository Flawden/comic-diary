import {
  getCurrentUser,
} from "@/modules/auth/request-identity";

import {
  hasPermission,
} from "@/modules/auth/permissions";

/**
 * UI navigation/access model only.
 *
 * Every mutation still re-authorizes through its existing
 * request-level authorization boundary.
 */
export async function getAdminWorkspaceAccess() {
  const currentUser =
    await getCurrentUser();

  if (!currentUser) {
    return {
      currentUser: null,
      canAccessWorkspace: false,
      canEditCatalog: false,
      canAdminUsers: false,
      canRunBulkImport: false,
      canViewAudit: false,
    } as const;
  }

  const canEditCatalog =
    hasPermission(
      currentUser.role,
      "EDIT_SHARED_CATALOG",
    );

  const canAdminUsers =
    hasPermission(
      currentUser.role,
      "ADMIN_USERS",
    );

  const canRunBulkImport =
    hasPermission(
      currentUser.role,
      "RUN_BULK_IMPORT",
    );

  const canViewAudit =
    hasPermission(
      currentUser.role,
      "ADMIN_SECURITY",
    );

  return {
    currentUser,
    canAccessWorkspace:
      canEditCatalog ||
      canAdminUsers ||
      canRunBulkImport ||
      canViewAudit,
    canEditCatalog,
    canAdminUsers,
    canRunBulkImport,
    canViewAudit,
  };
}
