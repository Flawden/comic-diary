// AUTH-01C2B4: CI-only fixture compatibility with the pending-by-default migration.
// No database access, no browser launch, and no production account creation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const migration = source("../drizzle/0034_auth_registration_activation_marker.sql");
const reader = source("./work-reader-browser.mjs");
const admin = source("./admin-core-browser.mjs");
const visual = source("./visual-theme-qa.mjs");
const workflow = source("../.github/workflows/ci.yml");

test("0034 preserves historical NULL and defaults future registrations to pending", () => {
  assert.match(migration, /ADD COLUMN \"verification_required_at\" timestamp with time zone;/);
  assert.match(migration, /ALTER COLUMN \"verification_required_at\" SET DEFAULT now\(\);/);
  assert.doesNotMatch(migration, /UPDATE \"users\"/i);
});

test("reader browser fixture explicitly represents a historical account", () => {
  assert.match(reader, /INSERT INTO users\(email,verification_required_at\) VALUES \(\$1,NULL\) RETURNING id/);
  assert.match(reader, /process\.env\.CI !== "true"/);
  assert.match(reader, /ciDbUrl\.hostname !== "127\.0\.0\.1"/);
  assert.match(reader, /ciDbUrl\.username !== "comic_diary_ci"/);
  assert.match(reader, /\/comic_diary_release/);
});

test("admin browser fixtures explicitly represent historical admin and reader", () => {
  assert.match(admin, /INSERT INTO users\(email, role, verification_required_at\) VALUES \(\$1, \$2, NULL\) RETURNING id/g);
  assert.equal((admin.match(/INSERT INTO users\(email, role, verification_required_at\) VALUES \(\$1, \$2, NULL\) RETURNING id/g) ?? []).length, 2);
  assert.match(admin, /process\.env\.CI !== 'true'/);
  assert.match(admin, /hostname !== '127\.0\.0\.1'/);
});

test("visual QA fixture explicitly represents a historical reader", () => {
  assert.match(visual, /INSERT INTO users\(email, display_name, verification_required_at\) VALUES \(\$1,\$2,NULL\) RETURNING id/);
  assert.match(visual, /process\.env\.CI !== 'true'/);
  assert.match(visual, /dbUrl\.hostname !== '127\.0\.0\.1'/);
});

test("fixture policy regression runs in GitHub Verify", () => {
  assert.match(workflow, /AUTH-01C2B4 browser fixture activation regression/);
  assert.match(workflow, /node --test scripts\/auth-registration-c2b4abc-browser-fixture-contract\.test\.mjs/);
});
