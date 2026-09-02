import {
  hasPermission,
  type UserRole,
} from "@/modules/auth/permissions";

export type AdminImportAuthorizationFailure =
  | {
      ok: false;
      kind: "origin-not-allowed";
      status: 403;
    }
  | {
      ok: false;
      kind: "unauthorized";
      status: 401;
    }
  | {
      ok: false;
      kind: "forbidden";
      status: 403;
    }
  | {
      ok: false;
      kind: "admin-unavailable";
      status: 503;
    };

export type AdminImportAuthorization =
  | {
      ok: true;
    }
  | AdminImportAuthorizationFailure;

type RequestPolicyInput = {
  sameOrigin: boolean;
  userRole: UserRole | null;
  enabled: boolean;
};

type PagePolicyInput = {
  userRole: UserRole | null;
  enabled: boolean;
};

function authorizeRole(
  userRole: UserRole | null,
  enabled: boolean,
): AdminImportAuthorization {
  if (!userRole) {
    return {
      ok: false,
      kind: "unauthorized",
      status: 401,
    };
  }

  if (
    !hasPermission(
      userRole,
      "RUN_BULK_IMPORT",
    )
  ) {
    return {
      ok: false,
      kind: "forbidden",
      status: 403,
    };
  }

  if (!enabled) {
    return {
      ok: false,
      kind: "admin-unavailable",
      status: 503,
    };
  }

  return {
    ok: true,
  };
}

export function evaluateAdminImportRequestPolicy({
  sameOrigin,
  userRole,
  enabled,
}: RequestPolicyInput):
  AdminImportAuthorization {
  if (!sameOrigin) {
    return {
      ok: false,
      kind: "origin-not-allowed",
      status: 403,
    };
  }

  return authorizeRole(
    userRole,
    enabled,
  );
}

export function evaluateAdminImportPagePolicy({
  userRole,
  enabled,
}: PagePolicyInput):
  AdminImportAuthorization {
  return authorizeRole(
    userRole,
    enabled,
  );
}
