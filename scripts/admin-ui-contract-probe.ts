import {
  existsSync,
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

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

function source(
  path: string,
): string {
  const resolved =
    resolve(
      process.cwd(),
      path,
    );

  assert(
    existsSync(
      resolved,
    ),
    `missing ${path}`,
  );

  return readFileSync(
    resolved,
    "utf8",
  );
}

const access =
  source(
    "src/modules/admin-ui/admin-page-access.ts",
  );

const readModel =
  source(
    "src/modules/admin-ui/admin-read-model.ts",
  );

const dashboard =
  source(
    "src/app/admin/page.tsx",
  );

const comicsPage =
  source(
    "src/app/admin/comics/page.tsx",
  );

const comicsClient =
  source(
    "src/app/admin/comics/AdminComicManager.tsx",
  );

const usersPage =
  source(
    "src/app/admin/users/page.tsx",
  );

const usersClient =
  source(
    "src/app/admin/users/AdminUserManager.tsx",
  );

for (
  const required of [
    '"EDIT_SHARED_CATALOG"',
    '"ADMIN_USERS"',
    '"RUN_BULK_IMPORT"',
    "getCurrentUser",
  ]
) {
  assert(
    access.includes(
      required,
    ),
    `admin access model missing ${required}`,
  );
}

assert(
  readModel.includes(
    ".leftJoin(",
  ) &&
    readModel.includes(
      "publicationStatus:",
    ) &&
    readModel.includes(
      "users.email",
    ) &&
    readModel.includes(
      "users.isActive",
    ),
  "admin read model is incomplete",
);

for (
  const forbidden of [
    "passwordHash",
    "tokenHash",
    "sessions.",
  ]
) {
  assert(
    !readModel.includes(
      forbidden,
    ),
    `admin read model exposes secret/session field: ${forbidden}`,
  );
}

for (
  const required of [
    'href="/admin/comics"',
    'href="/admin/users"',
    'href="/admin/catalog-import/vk"',
    '"/login?next=%2Fadmin"',
  ]
) {
  assert(
    dashboard.includes(
      required,
    ),
    `admin dashboard missing ${required}`,
  );
}

assert(
  comicsPage.includes(
    "listAdminComics",
  ) &&
    comicsPage.includes(
      "listAdminCategories",
    ) &&
    comicsPage.includes(
      "canEditCatalog",
    ),
  "admin comics page read/access contract incomplete",
);

for (
  const required of [
    '"/api/admin/catalog/comics"',
    '"POST"',
    '"PATCH"',
    'name="publicationStatus"',
    'name="categorySlug"',
    'name="sourceUrl"',
    "immutableSlug",
  ]
) {
  assert(
    comicsClient.includes(
      required,
    ),
    `admin comics UI missing ${required}`,
  );
}

assert(
  !comicsClient.includes(
    'method: "DELETE"',
  ),
  "R7.3A must not add comic deletion",
);

assert(
  usersPage.includes(
    "listAdminUsers",
  ) &&
    usersPage.includes(
      "canAdminUsers",
    ),
  "admin users page read/access contract incomplete",
);

for (
  const required of [
    'method:\n              "PATCH"',
    "`/api/admin/users/${user.id}`",
    'name="role"',
    'name="isActive"',
    "last-active-admin",
    "window.confirm",
  ]
) {
  assert(
    usersClient.includes(
      required,
    ),
    `admin users UI missing ${required}`,
  );
}

for (
  const forbidden of [
    'name="password"',
    "passwordHash",
    "tokenHash",
  ]
) {
  assert(
    !usersClient.includes(
      forbidden,
    ),
    `admin users UI exposes forbidden secret field ${forbidden}`,
  );
}

console.log(
  "R7_3A_ADMIN_UI_CONTRACT_PROBE=PASS",
);
console.log(
  "ADMIN_DASHBOARD=/admin",
);
console.log(
  "ADMIN_COMICS=/admin/comics",
);
console.log(
  "ADMIN_USERS=/admin/users",
);
console.log(
  "VK_IMPORT_REUSED=/admin/catalog-import/vk",
);
console.log(
  "EDITOR_CATALOG_UI=EDIT_SHARED_CATALOG",
);
console.log(
  "USER_ADMIN_UI=ADMIN_USERS",
);
console.log(
  "VK_IMPORT_UI=RUN_BULK_IMPORT",
);
console.log(
  "READ_SIDE=SERVER_DRIZZLE_NO_NEW_ADMIN_GET_API",
);
console.log(
  "CATALOG_MUTATION_API=EXISTING_POST_PATCH_REUSED",
);
console.log(
  "USER_MUTATION_API=EXISTING_PATCH_REUSED",
);
console.log(
  "COMIC_DELETE=NOT_IMPLEMENTED",
);
console.log(
  "PASSWORD_OR_SESSION_SECRET_UI=NONE",
);
console.log(
  "SCHEMA_MIGRATION=NONE",
);
