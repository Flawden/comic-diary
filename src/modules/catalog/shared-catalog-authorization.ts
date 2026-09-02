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
  evaluateSharedCatalogMutationPolicy,
} from "./shared-catalog-policy";

/**
 * Shared/public catalog mutations use the normal
 * Comic Diary session identity.
 *
 * Reject origin before any session/database lookup
 * and before request-body parsing.
 */
export async function authorizeSharedCatalogMutationRequest(
  request: NextRequest,
) {
  if (!isSameOriginRequest(request)) {
    return evaluateSharedCatalogMutationPolicy({
      sameOrigin: false,
      userRole: null,
    });
  }

  const currentUser =
    await getCurrentUser();

  return evaluateSharedCatalogMutationPolicy({
    sameOrigin: true,
    userRole:
      currentUser?.role ??
      null,
  });
}
