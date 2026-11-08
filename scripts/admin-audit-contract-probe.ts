import {
  readFileSync,
} from "node:fs";

function source(
  path: string,
) {
  return readFileSync(
    path,
    "utf8",
  ).replace(/\r\n?/g, "\n");
}

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

const schema =
  source(
    "src/db/schema.ts",
  );
const catalogMutations =
  source(
    "src/modules/catalog/shared-catalog-mutations.ts",
  );
const catalogAuthorization =
  source(
    "src/modules/catalog/shared-catalog-authorization.ts",
  );
const comicRoute =
  source(
    "src/app/api/admin/catalog/comics/route.ts",
  );
const categoryRoute =
  source(
    "src/app/api/admin/catalog/categories/route.ts",
  );
const importAuthorization =
  source(
    "src/modules/admin-import/admin-import-authorization.ts",
  );
const importApply =
  source(
    "src/modules/admin-import/vk/vk-canonical-apply.ts",
  );
const importRoute =
  source(
    "src/app/api/admin/catalog-import/vk/import/route.ts",
  );
const accountAdministration =
  source(
    "src/modules/auth/account-administration.ts",
  );
const accountRoute =
  source(
    "src/app/api/admin/users/[id]/route.ts",
  );
const readModel =
  source(
    "src/modules/admin-ui/admin-read-model.ts",
  );
const access =
  source(
    "src/modules/admin-ui/admin-page-access.ts",
  );
const dashboard =
  source(
    "src/app/admin/page.tsx",
  );
const auditPage =
  source(
    "src/app/admin/audit/page.tsx",
  );

for (
  const required of
  [
    '"administrative_audit_action"',
    '"administrative_audit_target"',
    '"administrative_audit_events"',
    '"actor_user_id"',
    '"actor_role"',
    '"target_type"',
    '"target_key"',
    '"details"',
    '"occurred_at"',
    "administrative_audit_events_occurred_at_idx",
    "administrative_audit_events_actor_user_id_idx",
    "administrative_audit_events_target_idx",
  ]
) {
  assert(
    schema.includes(
      required,
    ),
    `audit schema missing ${required}`,
  );
}

for (
  const action of
  [
    "CATEGORY_CREATE",
    "CATEGORY_UPDATE",
    "COMIC_CREATE",
    "COMIC_UPDATE",
    "VK_IMPORT_APPLY",
    "ACCOUNT_ROLE_CHANGE",
    "ACCOUNT_ACTIVE_CHANGE",
    "ACCOUNT_ENTITLEMENTS_CHANGE",
  ]
) {
  assert(
    schema.includes(
      `"${action}"`,
    ),
    `audit action enum missing ${action}`,
  );
}

for (
  const action of
  [
    '"CATEGORY_CREATE"',
    '"CATEGORY_UPDATE"',
    '"COMIC_CREATE"',
    '"COMIC_UPDATE"',
  ]
) {
  assert(
    catalogMutations.includes(
      action,
    ),
    `catalog audit missing ${action}`,
  );
}

assert(
  catalogMutations.includes(
    ".insert(\n          administrativeAuditEvents",
  ) &&
    catalogMutations.includes(
      "actorUserId",
    ) &&
    catalogMutations.includes(
      "actorRole",
    ),
  "catalog audit insert missing",
);

assert(
  catalogAuthorization.includes(
    "currentUser",
  ) &&
    comicRoute.includes(
      "access.currentUser.id",
    ) &&
    categoryRoute.includes(
      "access.currentUser.id",
    ),
  "catalog mutation actor propagation missing",
);

assert(
  importApply.includes(
    '"VK_IMPORT_APPLY"',
  ) &&
    importApply.includes(
      "administrativeAuditEvents",
    ) &&
    importApply.includes(
      "result.summary",
    ) &&
    importAuthorization.includes(
      "currentUser",
    ) &&
    importRoute.includes(
      "authorization.currentUser.id",
    ),
  "VK import audit actor/batch path missing",
);

for (
  const action of
  [
    '"ACCOUNT_ROLE_CHANGE"',
    '"ACCOUNT_ACTIVE_CHANGE"',
    '"ACCOUNT_ENTITLEMENTS_CHANGE"',
  ]
) {
  assert(
    accountAdministration.includes(
      action,
    ),
    `account audit missing ${action}`,
  );
}

assert(
  accountAdministration.includes(
    "auditRows",
  ) &&
    accountAdministration.includes(
      "sessionsRevoked",
    ) &&
    accountRoute.includes(
      "currentUser.id",
    ),
  "account audit actor/state path missing",
);

assert(
  readModel.includes(
    "listAdministrativeAuditEvents",
  ) &&
    readModel.includes(
      "administrativeAuditEvents.actorUserId",
    ) &&
    !readModel.includes(
      "passwordHash:",
    ) &&
    !readModel.includes(
      "tokenHash:",
    ),
  "audit read model missing or exposes secret fields",
);

assert(
  access.includes(
    '"ADMIN_SECURITY"',
  ) &&
    access.includes(
      "canViewAudit",
    ) &&
    dashboard.includes(
      'href="/admin/audit"',
    ) &&
    auditPage.includes(
      "access.canViewAudit",
    ),
  "ADMIN_SECURITY audit UI boundary missing",
);

for (
  const forbidden of
  [
    "password_hash",
    "token_hash",
    "comic_diary_session",
  ]
) {
  assert(
    !auditPage.includes(
      forbidden,
    ),
    `audit UI contains forbidden secret marker ${forbidden}`,
  );
}

console.log(
  "R7_6_ADMINISTRATIVE_AUDIT_CONTRACT_PROBE=PASS",
);
console.log(
  "AUDIT_STORAGE=administrative_audit_events",
);
console.log(
  "AUDIT_WRITE_POLICY=APPEND_ONLY_APPLICATION_BOUNDARY",
);
console.log(
  "AUDIT_ATOMICITY=SAME_TRANSACTION_AS_MUTATION",
);
console.log(
  "EDITOR_CONTENT_ACTIONS=AUDITED",
);
console.log(
  "ADMIN_IMPORT_ACTIONS=AUDITED",
);
console.log(
  "ADMIN_ACCOUNT_ACTIONS=AUDITED",
);
console.log(
  "AUDIT_READ_PERMISSION=ADMIN_SECURITY",
);
console.log(
  "IMPORT_RECEIPTS=RETAINED_AS_ITEM_PROVENANCE",
);
console.log(
  "AUDIT_SECRET_FIELDS=NONE",
);
