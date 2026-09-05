import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  ACCOUNT_ENTITLEMENTS,
  AccountAdministrationError,
  type AccountEntitlement,
  updateManagedAccount,
} from "@/modules/auth/account-administration";

import {
  authorizeAdminAccountRequest,
} from "@/modules/auth/admin-account-authorization";

import {
  PermissionDeniedError,
  type UserRole,
} from "@/modules/auth/permissions";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const MAX_REQUEST_BYTES =
  16 * 1024;

const allowedRoles =
  new Set<UserRole>([
    "USER",
    "EDITOR",
    "ADMIN",
  ]);

const allowedEntitlements =
  new Set<AccountEntitlement>(
    ACCOUNT_ENTITLEMENTS,
  );

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function jsonResponse(
  value: unknown,
  status: number,
) {
  return NextResponse.json(
    value,
    {
      status,

      headers: {
        "cache-control":
          "no-store",

        "x-content-type-options":
          "nosniff",
      },
    },
  );
}

function errorResponse(
  kind: string,
  status: number,
) {
  return jsonResponse(
    {
      ok: false,

      error: {
        kind,
      },
    },
    status,
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value,
    )
  );
}

type ParsedUpdate =
  | {
      ok: true;

      update: {
        role?: UserRole;
        isActive?: boolean;
        entitlements?: AccountEntitlement[];
      };
    }
  | {
      ok: false;

      response:
        NextResponse;
    };

async function readUpdate(
  request: NextRequest,
): Promise<ParsedUpdate> {
  const contentType =
    request.headers
      .get(
        "content-type",
      )
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();

  if (
    contentType !==
      "application/json"
  ) {
    return {
      ok: false,

      response:
        errorResponse(
          "unsupported-media-type",
          415,
        ),
    };
  }

  const rawLength =
    request.headers.get(
      "content-length",
    );

  if (rawLength) {
    const contentLength =
      Number(
        rawLength,
      );

    if (
      Number.isFinite(
        contentLength,
      ) &&
      contentLength >
        MAX_REQUEST_BYTES
    ) {
      return {
        ok: false,

        response:
          errorResponse(
            "request-too-large",
            413,
          ),
      };
    }
  }

  const rawBody =
    await request.text();

  if (
    Buffer.byteLength(
      rawBody,
      "utf8",
    ) >
    MAX_REQUEST_BYTES
  ) {
    return {
      ok: false,

      response:
        errorResponse(
          "request-too-large",
          413,
        ),
    };
  }

  let value:
    unknown;

  try {
    value =
      JSON.parse(
        rawBody,
      );
  } catch {
    return {
      ok: false,

      response:
        errorResponse(
          "invalid-json",
          400,
        ),
    };
  }

  if (
    !isRecord(
      value,
    )
  ) {
    return {
      ok: false,

      response:
        errorResponse(
          "invalid-request",
          400,
        ),
    };
  }

  const keys =
    Object.keys(
      value,
    );

  if (
    keys.length ===
      0 ||
    keys.some(
      (key) =>
        key !== "role" &&
        key !== "isActive" &&
        key !== "entitlements",
    )
  ) {
    return {
      ok: false,

      response:
        errorResponse(
          "invalid-request",
          400,
        ),
    };
  }

  const update: {
    role?: UserRole;
    isActive?: boolean;
    entitlements?: AccountEntitlement[];
  } = {};

  if (
    Object.prototype.hasOwnProperty.call(
      value,
      "role",
    )
  ) {
    if (
      typeof value.role !==
        "string" ||
      !allowedRoles.has(
        value.role as UserRole,
      )
    ) {
      return {
        ok: false,

        response:
          errorResponse(
            "invalid-role",
            400,
          ),
      };
    }

    update.role =
      value.role as UserRole;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      value,
      "isActive",
    )
  ) {
    if (
      typeof value.isActive !==
        "boolean"
    ) {
      return {
        ok: false,

        response:
          errorResponse(
            "invalid-active-state",
            400,
          ),
      };
    }

    update.isActive =
      value.isActive;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      value,
      "entitlements",
    )
  ) {
    if (
      !Array.isArray(
        value.entitlements,
      ) ||
      value.entitlements.length >
        ACCOUNT_ENTITLEMENTS.length ||
      value.entitlements.some(
        (entitlement) =>
          typeof entitlement !==
            "string" ||
          !allowedEntitlements.has(
            entitlement as AccountEntitlement,
          ),
      )
    ) {
      return {
        ok: false,

        response:
          errorResponse(
            "invalid-entitlements",
            400,
          ),
      };
    }

    update.entitlements =
      [...new Set(
        value.entitlements as AccountEntitlement[],
      )].sort();
  }

  return {
    ok: true,
    update,
  };
}

function administrationErrorResponse(
  error: unknown,
) {
  if (
    error instanceof
      PermissionDeniedError
  ) {
    return errorResponse(
      "forbidden",
      403,
    );
  }

  if (
    error instanceof
      AccountAdministrationError
  ) {
    if (
      error.kind ===
        "user-not-found"
    ) {
      return errorResponse(
        error.kind,
        404,
      );
    }

    if (
      error.kind ===
        "last-active-admin"
    ) {
      return errorResponse(
        error.kind,
        409,
      );
    }

    return errorResponse(
      error.kind,
      400,
    );
  }

  console.error(
    error,
  );

  return errorResponse(
    "account-administration-failed",
    500,
  );
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  /*
   * This is deliberately the first operation.
   *
   * Cross-origin requests are rejected before session
   * lookup. Anonymous/unauthorized callers are rejected
   * before params/body parsing reaches the mutation path.
   */
  const {
    authorization,
    currentUser,
  } =
    await authorizeAdminAccountRequest(
      request,
    );

  if (
    !authorization.ok
  ) {
    return errorResponse(
      authorization.kind,
      authorization.status,
    );
  }

  /*
   * Authorization success implies a real current ADMIN
   * identity with ADMIN_USERS permission.
   */
  if (!currentUser) {
    return errorResponse(
      "unauthorized",
      401,
    );
  }

  const {
    id,
  } =
    await context.params;

  const targetUserId =
    Number(
      id,
    );

  if (
    !Number.isInteger(
      targetUserId,
    ) ||
    targetUserId <=
      0
  ) {
    return errorResponse(
      "invalid-user-id",
      400,
    );
  }

  const parsed =
    await readUpdate(
      request,
    );

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const result =
      await updateManagedAccount(
        currentUser.role,
        targetUserId,
        parsed.update,
      );

    return jsonResponse(
      {
        ok: true,

        user:
          result.user,

        sessionsRevoked:
          result.sessionsRevoked,
      },
      200,
    );
  } catch (
    error
  ) {
    return administrationErrorResponse(
      error,
    );
  }
}
