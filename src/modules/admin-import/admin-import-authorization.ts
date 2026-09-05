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
    const authorization =
      evaluateAdminImportRequestPolicy({
        sameOrigin: false,
        userRole: null,
        enabled: false,
      });

    if (authorization.ok) {
      throw new Error(
        "Cross-origin import authorization unexpectedly succeeded",
      );
    }

    return authorization;
  }

  const currentUser =
    await getCurrentUser();

  const authorization =
    evaluateAdminImportRequestPolicy({
      sameOrigin: true,
      userRole:
        currentUser?.role ??
        null,
      enabled:
        adminImportEnabled(),
    });

  if (!authorization.ok) {
    return authorization;
  }

  if (!currentUser) {
    return {
      ok: false,
      kind: "unauthorized",
      status: 401,
    } as const;
  }

  return {
    ...authorization,
    currentUser,
  } as const;
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
