import {
  readFileSync,
} from "node:fs";

function source(
  path: string,
) {
  return readFileSync(
    path,
    "utf8",
  );
}

function assertIncludes(
  text: string,
  expected: string,
  message: string,
) {
  if (!text.includes(expected)) {
    throw new Error(message);
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

const detail =
  source(
    "src/app/comics/[slug]/page.tsx",
  );

const updateStart =
  service.indexOf(
    "export async function updateOwnPrivateTitleMetadata",
  );

const deleteStart =
  service.indexOf(
    "export async function deleteOwnPrivateTitle",
  );

if (
  updateStart < 0 ||
  deleteStart <= updateStart
) {
  throw new Error(
    "private metadata edit service boundary missing",
  );
}

const updateService =
  service.slice(
    updateStart,
    deleteStart,
  );

assertIncludes(
  service,
  "PrivateTitleMetadataInput",
  "create/edit must share private metadata input normalization",
);

assertIncludes(
  updateService,
  'comics.visibility,\n                "PRIVATE"',
  "private metadata edit must require PRIVATE visibility",
);

assertIncludes(
  updateService,
  "comics.ownerUserId",
  "private metadata edit must bind owner identity",
);

if (
  updateService.includes(
    "userEntitlements",
  ) ||
  updateService.includes(
    '"PRIVATE_CATALOG"',
  )
) {
  throw new Error(
    "private metadata edit must remain available to the owner after entitlement revocation",
  );
}

assertIncludes(
  updateService,
  "userComics.currentChapter",
  "private metadata edit must read current diary progress",
);

assertIncludes(
  updateService,
  "normalized.totalChapters <\n          current.currentChapter",
  "private metadata edit must reject total chapters below saved progress",
);

assertIncludes(
  service,
  '"total-chapters-below-progress"',
  "private metadata progress-floor error missing",
);

assertIncludes(
  updateService,
  "updatedAt:\n              new Date()",
  "private metadata edit must update comic metadata timestamp",
);

if (
  updateService.includes(
    "slug:\n              createPrivateSlug()",
  )
) {
  throw new Error(
    "private metadata edit must not rotate the opaque slug",
  );
}

assertIncludes(
  route,
  'intent ===\n      "edit"',
  "private title route edit intent missing",
);

assertIncludes(
  route,
  "updateOwnPrivateTitleMetadata",
  "private title route does not call owner metadata edit service",
);

if (
  route.includes(
    'formData.get("userId")',
  )
) {
  throw new Error(
    "private metadata edit must not accept client user identity",
  );
}

assertIncludes(
  detail,
  'value="edit"',
  "private detail owner metadata edit form missing",
);

assertIncludes(
  detail,
  "defaultValue={comic.title}",
  "private edit title field must be prefilled",
);

assertIncludes(
  detail,
  "defaultValue={comic.sourceUrl}",
  "private edit source URL field must be prefilled",
);

assertIncludes(
  detail,
  "readingState?.currentChapter",
  "private edit UI must expose the saved-progress floor",
);

assertIncludes(
  detail,
  "Его внутренний идентификатор не меняется",
  "private edit UI must explain stable opaque identity",
);

console.log(
  "R8_2_PRIVATE_METADATA_EDIT_OWNER_CONTRACT=PASS",
);

console.log(
  "R8_2_PRIVATE_METADATA_EDIT_AFTER_ENTITLEMENT_REVOCATION=OWNER_ALLOWED",
);

console.log(
  "R8_2_PRIVATE_METADATA_EDIT_PROGRESS_FLOOR=REJECT_BELOW_CURRENT",
);

console.log(
  "R8_2_PRIVATE_METADATA_EDIT_SLUG_STABLE=PASS",
);

console.log(
  "R8_2_PRIVATE_METADATA_EDIT_UI_CONTRACT=PASS",
);

console.log(
  "R8_2_PRIVATE_TITLE_METADATA_EDIT_CONTRACT_PROBE=PASS",
);
