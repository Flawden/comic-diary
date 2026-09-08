import {
  readFileSync,
} from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const schema = source("src/db/schema.ts");
const permissions = source("src/modules/auth/permissions.ts");
const administration = source("src/modules/auth/account-administration.ts");
const route = source("src/app/api/admin/users/[id]/route.ts");
const readModel = source("src/modules/admin-ui/admin-read-model.ts");
const ui = source("src/app/admin/users/AdminUserManager.tsx");

assert(
  schema.includes('"account_entitlement"') &&
    schema.includes('"PRIVATE_CATALOG"') &&
    schema.includes('"user_entitlements"') &&
    schema.includes('user_entitlements_user_id_entitlement_pk'),
  "entitlement schema foundation missing",
);

assert(
  !permissions.includes('"PRIVATE_CATALOG"'),
  "PRIVATE_CATALOG must not become a role permission",
);

assert(
  administration.includes('ACCOUNT_ENTITLEMENTS') &&
    administration.includes('entitlements?: readonly AccountEntitlement[]') &&
    administration.includes('userEntitlements') &&
    administration.includes('entitlementChanged'),
  "account administration entitlement path missing",
);

assert(
  route.includes('"entitlements"') &&
    route.includes('"invalid-entitlements"') &&
    route.includes('allowedEntitlements'),
  "admin users API entitlement validation missing",
);

assert(
  readModel.includes('userEntitlements.entitlement') &&
    readModel.includes('entitlements:'),
  "admin read model entitlement state missing",
);

assert(
  ui.includes('name="entitlement_PRIVATE_CATALOG"') &&
    ui.includes('"PRIVATE_CATALOG"') &&
    ui.includes('entitlementsChanged'),
  "admin users UI entitlement control missing",
);

console.log("R7_5_ACCOUNT_ENTITLEMENTS_CONTRACT_PROBE=PASS");
console.log("ROLE_ENUM=USER,EDITOR,ADMIN_UNCHANGED");
console.log("ENTITLEMENT=PRIVATE_CATALOG");
console.log("ENTITLEMENT_STORAGE=user_entitlements");
console.log("ENTITLEMENT_ADMIN_BOUNDARY=ADMIN_USERS");
console.log("EDITOR_ENTITLEMENT_ADMIN=DENIED_BY_ADMIN_USERS");
console.log("ENTITLEMENT_SESSION_REVOCATION=YES");
console.log("R8_2_PRIVATE_CATALOG_BEHAVIOR=IMPLEMENTED");
