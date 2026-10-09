import {
  readFileSync,
} from "node:fs";

function source(
  path: string,
) {
  return readFileSync(
    path,
    "utf8",
  ).replace(/\r\n/g, "\n");
}

function assertIncludes(
  text: string,
  expected: string,
  message: string,
) {
  if (
    !text.includes(
      expected,
    )
  ) {
    throw new Error(
      message,
    );
  }
}

const service =
  source(
    "src/modules/private-catalog/private-title-mutations.ts",
  );

const route =
  source(
    "src/app/api/library/private-titles/route.ts",
  );

const library =
  source(
    "src/app/library/page.tsx",
  );

const detail =
  source(
    "src/app/comics/[slug]/page.tsx",
  );

const diaryMutations =
  source(
    "src/modules/library/mutations/update-user-comic-state.ts",
  );

assertIncludes(
  service,
  "userEntitlements.entitlement",
  "private create must read PRIVATE_CATALOG entitlement inside its transaction",
);

assertIncludes(
  service,
  '"PRIVATE_CATALOG"',
  "private create must require PRIVATE_CATALOG entitlement",
);

assertIncludes(
  service,
  'visibility:\n              "PRIVATE"',
  "private create must write PRIVATE visibility",
);

assertIncludes(
  service,
  "ownerUserId:\n              userId",
  "private create must bind authenticated owner",
);

assertIncludes(
  service,
  ".insert(\n          userComics",
  "private create must atomically create normal diary state",
);

assertIncludes(
  service,
  "randomUUID()",
  "private slug must use opaque random identity",
);

assertIncludes(
  service,
  'eq(\n                comics.visibility,\n                "PRIVATE"',
  "private delete must require PRIVATE visibility",
);

assertIncludes(
  service,
  "comics.ownerUserId",
  "private delete must require owner identity",
);

assertIncludes(
  route,
  "isSameOriginRequest",
  "private title route must require same-origin POST",
);

assertIncludes(
  route,
  "await getCurrentUser()",
  "private title route must derive session identity",
);

if (
  route.includes(
    'formData.get("userId")',
  ) ||
  service.includes(
    "UserRole",
  ) ||
  service.includes(
    "requirePermission",
  )
) {
  throw new Error(
    "private catalog authority must not trust client userId or role permission",
  );
}

assertIncludes(
  library,
  "hasPrivateCatalogEntitlement",
  "library UI must expose create form only from entitlement state",
);

assertIncludes(
  library,
  'action="/api/library/private-titles"',
  "library UI private-create form missing",
);

assertIncludes(
  detail,
  "Личный тайтл",
  "private detail badge missing",
);

assertIncludes(
  detail,
  'value="delete"',
  "private owner delete form missing",
);

assertIncludes(
  detail,
  '"Открыть источник"',
  "private source link must not be VK-specific",
);

assertIncludes(
  diaryMutations,
  "return setUserComicTracking(userId, comicId, false)",
  "generic remove-from-library must disable tracking without orphaning private titles",
);

console.log(
  "R8_2_PRIVATE_CREATE_ENTITLEMENT_CONTRACT=PASS",
);

console.log(
  "R8_2_PRIVATE_CREATE_ATOMIC_DIARY_CONTRACT=PASS",
);

console.log(
  "R8_2_PRIVATE_OWNER_DELETE_CONTRACT=PASS",
);

console.log(
  "R8_2_PRIVATE_OPAQUE_SLUG_CONTRACT=PASS",
);

console.log(
  "R8_2_PRIVATE_UI_ENTRYPOINT_CONTRACT=PASS",
);

console.log(
  "R8_2_PRIVATE_NO_ORPHAN_LIBRARY_REMOVAL_CONTRACT=PASS",
);

console.log(
  "R8_2_PRIVATE_TITLE_CREATE_DELETE_CONTRACT_PROBE=PASS",
);
