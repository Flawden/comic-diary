import type {
  NextRequest,
} from "next/server";

import {
  getCurrentUser,
} from "./request-identity";

import {
  isSameOriginRequest,
} from "./request-origin";

import {
  evaluateAdminAccountRequestPolicy,
} from "./admin-account-policy";

/**
 * Origin rejection deliberately happens before
 * session/database resolution and before body reads.
 */
export async function authorizeAdminAccountRequest(
  request: NextRequest,
) {
  if (
    !isSameOriginRequest(
      request,
    )
  ) {
    return {
      authorization:
        evaluateAdminAccountRequestPolicy({
          sameOrigin: false,
          userRole: null,
        }),

      currentUser:
        null,
    };
  }

  const currentUser =
    await getCurrentUser();

  return {
    authorization:
      evaluateAdminAccountRequestPolicy({
        sameOrigin: true,
        userRole:
          currentUser?.role ??
          null,
      }),

    currentUser,
  };
}
