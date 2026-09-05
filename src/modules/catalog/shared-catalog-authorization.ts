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
    const authorization =
      evaluateSharedCatalogMutationPolicy({
        sameOrigin: false,
        userRole: null,
      });

    if (authorization.ok) {
      throw new Error(
        "Cross-origin catalog authorization unexpectedly succeeded",
      );
    }

    return authorization;
  }

  const currentUser =
    await getCurrentUser();

  const authorization =
    evaluateSharedCatalogMutationPolicy({
      sameOrigin: true,
      userRole:
        currentUser?.role ??
        null,
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
