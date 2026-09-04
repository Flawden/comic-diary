import {
  readFileSync,
} from "node:fs";

function read(
  path: string,
) {
  return readFileSync(
    path,
    "utf8",
  ).replaceAll(
    "\r\n",
    "\n",
  );
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

const route =
  read(
    "src/app/api/admin/catalog/categories/route.ts",
  );
const mutations =
  read(
    "src/modules/catalog/shared-catalog-mutations.ts",
  );
const canonicalWrite =
  read(
    "src/modules/catalog/canonical-catalog-write.ts",
  );
const page =
  read(
    "src/app/admin/categories/page.tsx",
  );
const manager =
  read(
    "src/app/admin/categories/AdminCategoryManager.tsx",
  );
const dashboard =
  read(
    "src/app/admin/page.tsx",
  );
const readModel =
  read(
    "src/modules/admin-ui/admin-read-model.ts",
  );
const schema =
  read(
    "src/db/schema.ts",
  );

assert(
  route.includes(
    "authorizeSharedCatalogMutationRequest",
  ),
  "Category route does not reuse shared-catalog authorization",
);
const authorizeIndex =
  route.indexOf(
    "await authorize(\n      request,\n    )",
  );
const bodyReadIndex =
  route.indexOf(
    "await readCatalogCategory(\n      request,\n    )",
  );

assert(
  authorizeIndex >= 0 &&
    bodyReadIndex >= 0 &&
    authorizeIndex < bodyReadIndex,
  "Category route does not authorize before body parsing",
);
assert(
  route.includes(
    "export async function POST",
  ) &&
    route.includes(
      "export async function PATCH",
    ),
  "Category route must expose POST and PATCH",
);
assert(
  !route.includes(
    "export async function DELETE",
  ),
  "R7.4 must not expose category DELETE",
);
assert(
  mutations.includes(
    "createSharedCatalogCategory",
  ) &&
    mutations.includes(
      "updateSharedCatalogCategory",
    ),
  "Category mutations are missing",
);
assert(
  mutations.includes(
    "SHARED_CATALOG_ADVISORY_LOCK",
  ) &&
    mutations.includes(
      "validateCatalogData",
    ),
  "Category mutations must reuse advisory lock and canonical validation",
);
assert(
  canonicalWrite.includes(
    "canonicalCategoryUpdateValues",
  ) &&
    canonicalWrite.includes(
      "void slug;",
    ),
  "Category update does not exclude slug from mutable metadata",
);
assert(
  page.includes(
    "access.canEditCatalog",
  ) &&
    page.includes(
      "/login?next=%2Fadmin%2Fcategories",
    ),
  "Category page access boundary is incomplete",
);
assert(
  manager.includes(
    "readOnly={!create}",
  ) &&
    manager.includes(
      "immutableSlug",
    ),
  "Category UI does not preserve immutable slug identity",
);
assert(
  !manager.includes(
    '"DELETE"',
  ) &&
    !route.includes(
      "DELETE",
    ),
  "R7.4 must not expose destructive category deletion",
);
assert(
  dashboard.includes(
    'href="/admin/categories"',
  ),
  "Admin dashboard does not link Categories Management",
);
assert(
  readModel.includes(
    "description:\n        categories.description",
  ) &&
    readModel.includes(
      "updatedAt:\n        categories.updatedAt",
    ),
  "Admin category read model lacks editable metadata",
);
assert(
  schema.includes(
    '{ onDelete: "set null" }',
  ),
  "Expected existing category reference shape changed",
);

console.log(
  "R7_4_CATEGORIES_CONTRACT_PROBE=PASS",
);
console.log(
  "CATEGORY_ADMIN_PAGE=/admin/categories",
);
console.log(
  "CATEGORY_MUTATION_API=/api/admin/catalog/categories",
);
console.log(
  "CATEGORY_AUTHORIZATION=EDIT_SHARED_CATALOG",
);
console.log(
  "CATEGORY_CREATE=POST",
);
console.log(
  "CATEGORY_EDIT=PATCH_METADATA_ONLY",
);
console.log(
  "CATEGORY_SLUG=IMMUTABLE_CANONICAL_IDENTITY",
);
console.log(
  "CATEGORY_DELETE=NOT_IMPLEMENTED",
);
console.log(
  "CATEGORY_REFERENCE_PROTECTION=NO_DESTRUCTIVE_DELETE",
);
console.log(
  "SHARED_CATALOG_LOCK=REUSED",
);
console.log(
  "CANONICAL_VALIDATION=validateCatalogData_REUSED",
);
console.log(
  "SCHEMA_MIGRATION=NONE",
);
