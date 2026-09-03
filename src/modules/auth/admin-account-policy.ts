import {
  hasPermission,
  type UserRole,
} from "./permissions";

export type AdminAccountAuthorizationFailure =
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
    };

export type AdminAccountAuthorization =
  | {
      ok: true;
    }
  | AdminAccountAuthorizationFailure;

type AdminAccountRequestPolicyInput = {
  sameOrigin: boolean;
  userRole: UserRole | null;
};

export function evaluateAdminAccountRequestPolicy({
  sameOrigin,
  userRole,
}: AdminAccountRequestPolicyInput):
  AdminAccountAuthorization {
  if (!sameOrigin) {
    return {
      ok: false,
      kind: "origin-not-allowed",
      status: 403,
    };
  }

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
      "ADMIN_USERS",
    )
  ) {
    return {
      ok: false,
      kind: "forbidden",
      status: 403,
    };
  }

  return {
    ok: true,
  };
}
