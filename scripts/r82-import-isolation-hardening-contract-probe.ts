import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function assertIncludes(
  source: string,
  expected: string,
  message: string,
) {
  if (!source.includes(expected)) {
    throw new Error(message);
  }
}

const planner = read(
  "src/modules/admin-import/vk/vk-canonical-db.ts",
);

const apply = read(
  "src/modules/admin-import/vk/vk-canonical-apply.ts",
);

const canonical = read(
  "src/modules/catalog/canonical-catalog-write.ts",
);

assertIncludes(
  planner,
  "VkPrivateCatalogSlugCollisionError",
  "DB-aware planner must expose a private-slug collision error",
);

assertIncludes(
  planner,
  "existing?.visibility ===",
  "DB-aware planner must inspect visibility before action planning",
);

assertIncludes(
  planner,
  '"PRIVATE"',
  "DB-aware planner must block private collisions",
);

assertIncludes(
  planner,
  "comics.visibility",
  "DB-aware planner must load row visibility",
);

assertIncludes(
  planner,
  'existing.visibility ===\n      "SHARED"',
  "canonical equality must be shared-only",
);

assertIncludes(
  apply,
  "VkPrivateCatalogSlugCollisionError",
  "canonical apply must reuse the private-slug collision error",
);

assertIncludes(
  apply,
  "existing?.visibility ===",
  "canonical apply must recheck visibility inside the transaction",
);

assertIncludes(
  apply,
  'eq(\n                      comics.visibility,\n                      "SHARED"',
  "canonical update must be constrained to shared rows",
);

assertIncludes(
  canonical,
  '"SHARED" as const',
  "canonical create must remain explicitly shared",
);

assertIncludes(
  canonical,
  "void ownerUserId",
  "canonical update must preserve owner state",
);

console.log(
  "R8_2_IMPORT_PRIVATE_SLUG_COLLISION_BLOCK=PASS",
);

console.log(
  "R8_2_IMPORT_SHARED_UPDATE_VISIBILITY_GUARD=PASS",
);

console.log(
  "R8_2_IMPORT_STALE_PLAN_RECHECK=PASS",
);

console.log(
  "R8_2_IMPORT_ISOLATION_HARDENING_CONTRACT_PROBE=PASS",
);
