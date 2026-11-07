import type { ReactNode } from "react";
import { getAdminWorkspaceAccess } from "@/modules/admin-ui/admin-page-access";
import { AdminShell } from "./AdminShell";
import "./admin-shell.css";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await getAdminWorkspaceAccess();

  // Preserve existing child-page login/forbidden behavior without exposing
  // the privileged navigation to a non-authorized account.
  if (!access.currentUser || !access.canAccessWorkspace) {
    return (
      <main id="main-content" className="admin-shell-fallback">
        {children}
      </main>
    );
  }

  return (
    <AdminShell
      role={access.currentUser.role}
      permissions={{
        editCatalog: access.canEditCatalog,
        manageUsers: access.canAdminUsers,
        runImport: access.canRunBulkImport,
        viewAudit: access.canViewAudit,
      }}
    >
      {children}
    </AdminShell>
  );
}
