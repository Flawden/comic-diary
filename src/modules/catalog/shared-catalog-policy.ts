import {
  hasPermission,
  type UserRole,
} from "@/modules/auth/permissions";

export type SharedCatalogAuthorizationFailure =
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

export type SharedCatalogAuthorization =
  | {
      ok: true;
    }
  | SharedCatalogAuthorizationFailure;

type SharedCatalogPolicyInput = {
  sameOrigin: boolean;
  userRole: UserRole | null;
};

export function evaluateSharedCatalogMutationPolicy({
  sameOrigin,
  userRole,
}: SharedCatalogPolicyInput):
  SharedCatalogAuthorization {
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
      "EDIT_SHARED_CATALOG",
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
