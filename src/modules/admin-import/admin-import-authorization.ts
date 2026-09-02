import type {
  NextRequest,
} from "next/server";

import {
  getCurrentUser,
} from "@/modules/auth/request-identity";
import {
  isSameOriginRequest,
} from "@/modules/auth/request-origin";

import {
  getAdminImportAvailability,
} from "./admin-import-gate";
import {
  evaluateAdminImportPagePolicy,
  evaluateAdminImportRequestPolicy,
} from "./admin-import-policy";

function adminImportEnabled() {
  return (
    getAdminImportAvailability() ===
    "ready"
  );
}

/**
 * Origin rejection deliberately happens before
 * session/database work and before request body reads.
 */
export async function authorizeAdminCatalogImportRequest(
  request: NextRequest,
) {
  if (!isSameOriginRequest(request)) {
    return evaluateAdminImportRequestPolicy({
      sameOrigin: false,
      userRole: null,
      enabled: false,
    });
  }

  const currentUser =
    await getCurrentUser();

  return evaluateAdminImportRequestPolicy({
    sameOrigin: true,
    userRole:
      currentUser?.role ??
      null,
    enabled:
      adminImportEnabled(),
  });
}

export async function authorizeAdminCatalogImportPage() {
  const currentUser =
    await getCurrentUser();

  return evaluateAdminImportPagePolicy({
    userRole:
      currentUser?.role ??
      null,
    enabled:
      adminImportEnabled(),
  });
}
