import type {
  NextRequest,
} from "next/server";

import {
  ADMIN_IMPORT_SESSION_COOKIE,
  getAdminImportAvailability,
  verifyAdminImportSession,
} from "./admin-import-gate";

export type AdminCatalogImportAuthorization =
  | {
      ok: true;
    }
  | {
      ok: false;
      status: 401 | 403 | 503;
      kind:
        | "admin-import-disabled"
        | "admin-import-misconfigured"
        | "admin-session-expired"
        | "origin-rejected";
    };

function firstForwardedValue(
  value: string | null,
) {
  if (!value) {
    return null;
  }

  return (
    value
      .split(",")[0]
      ?.trim() ||
    null
  );
}

function requestPublicOrigin(
  request: NextRequest,
) {
  const forwardedProto =
    firstForwardedValue(
      request.headers.get(
        "x-forwarded-proto",
      ),
    );

  const forwardedHost =
    firstForwardedValue(
      request.headers.get(
        "x-forwarded-host",
      ),
    );

  const host =
    forwardedHost ??
    request.headers.get(
      "host",
    ) ??
    request.nextUrl.host;

  const protocol =
    forwardedProto ??
    request.nextUrl.protocol.replace(
      ":",
      "",
    );

  if (
    !host ||
    (
      protocol !== "http" &&
      protocol !== "https"
    )
  ) {
    return null;
  }

  try {
    return new URL(
      `${protocol}://${host}`,
    ).origin;
  } catch {
    return null;
  }
}

function hasTrustedOrigin(
  request: NextRequest,
) {
  const rawOrigin =
    request.headers.get(
      "origin",
    );

  if (!rawOrigin) {
    return false;
  }

  const expectedOrigin =
    requestPublicOrigin(
      request,
    );

  if (!expectedOrigin) {
    return false;
  }

  try {
    return (
      new URL(rawOrigin).origin ===
      expectedOrigin
    );
  } catch {
    return false;
  }
}

/*
 * R5.3.6D intentionally puts authorization
 * behind one named server-side boundary.
 *
 * R6 will replace the temporary signed
 * admin-import session check here with the
 * real authenticated user + ADMIN role check.
 *
 * ADMIN_IMPORT_ENABLED remains an independent
 * feature gate even after role-based auth exists.
 */
export function authorizeAdminCatalogImportRequest(
  request: NextRequest,
): AdminCatalogImportAuthorization {
  const availability =
    getAdminImportAvailability();

  if (
    availability ===
    "disabled"
  ) {
    return {
      ok: false,
      status: 503,
      kind:
        "admin-import-disabled",
    };
  }

  if (
    availability ===
    "misconfigured"
  ) {
    return {
      ok: false,
      status: 503,
      kind:
        "admin-import-misconfigured",
    };
  }

  const session =
    request.cookies.get(
      ADMIN_IMPORT_SESSION_COOKIE,
    )?.value;

  if (
    !verifyAdminImportSession(
      session,
    )
  ) {
    return {
      ok: false,
      status: 401,
      kind:
        "admin-session-expired",
    };
  }

  if (
    !hasTrustedOrigin(
      request,
    )
  ) {
    return {
      ok: false,
      status: 403,
      kind:
        "origin-rejected",
    };
  }

  return {
    ok: true,
  };
}
