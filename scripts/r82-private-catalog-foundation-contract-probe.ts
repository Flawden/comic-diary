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

const schema = read("src/db/schema.ts");
const publicCatalog = read("src/modules/comics/queries/get-comics.ts");
const details = read("src/modules/comics/queries/get-comic-by-slug.ts");
const library = read("src/modules/library/queries/get-user-library.ts");
const state = read("src/modules/library/queries/get-user-comic-state.ts");
const mutations = read("src/modules/library/mutations/update-user-comic-state.ts");
const canonical = read("src/modules/catalog/canonical-catalog-write.ts");
const sharedMutations = read("src/modules/catalog/shared-catalog-mutations.ts");
const adminRead = read("src/modules/admin-ui/admin-read-model.ts");
const entitlements = read("src/modules/auth/account-entitlements.ts");
const migration = read("drizzle/0012_r8_2_private_catalog_foundation.sql");

for (const expected of [
  "comic_visibility",
  "SHARED",
  "PRIVATE",
  "owner_user_id",
  "comics_visibility_owner_check",
]) {
  assertIncludes(schema, expected, `schema marker missing: ${expected}`);
  assertIncludes(migration, expected, `migration marker missing: ${expected}`);
}

assertIncludes(publicCatalog, "comics.visibility", "public catalog must filter visibility");
assertIncludes(details, "comics.ownerUserId", "detail lookup must bind private owner");
assertIncludes(library, "comics.ownerUserId", "library query must bind private owner");
assertIncludes(state, "comics.ownerUserId", "state query must bind private owner");
assertIncludes(mutations, "comics.ownerUserId", "library mutations must bind private owner");
assertIncludes(canonical, '"SHARED" as const', "canonical create must be shared");
assertIncludes(canonical, "void ownerUserId", "canonical update must preserve ownership");
assertIncludes(sharedMutations, "comics.visibility", "manual shared update must exclude private rows");
if ((adminRead.match(/comics\.visibility/g) ?? []).length < 2) {
  throw new Error("admin read model must hide private rows and counts");
}
assertIncludes(entitlements, '"PRIVATE_CATALOG"', "entitlement helper contract missing");

console.log("R8_2_SCHEMA_VISIBILITY_OWNER_CONTRACT=PASS");
console.log("R8_2_OWNER_ISOLATED_READER_LIBRARY_CONTRACT=PASS");
console.log("R8_2_SHARED_ADMIN_MANUAL_BOUNDARY_CONTRACT=PASS");
console.log("R8_2_PRIVATE_CATALOG_ENTITLEMENT_READ_CONTRACT=PASS");
console.log("R8_2_PRIVATE_CATALOG_FOUNDATION_CONTRACT_PROBE=PASS");
