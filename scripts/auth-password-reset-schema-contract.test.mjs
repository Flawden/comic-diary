import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("src/db/schema.ts", "utf8");
const migration = readFileSync("drizzle/0031_auth_password_reset_tokens.sql", "utf8");
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));

const constraints = [
  "password_reset_tokens_token_hash_unique",
  "password_reset_tokens_user_id_idx",
  "password_reset_tokens_expires_at_idx",
  "password_reset_tokens_one_open_per_user_idx",
  "password_reset_tokens_hash_sha256_check",
  "password_reset_tokens_expiry_check",
  "password_reset_tokens_one_terminal_state_check",
];

test("schema and SQL refer to the same token table and named constraints", () => {
  assert.match(schema, /export const passwordResetTokens = pgTable\(\s*"password_reset_tokens"/);
  assert.match(migration, /CREATE TABLE "password_reset_tokens"/);
  for (const name of constraints) {
    assert.ok(schema.includes(`"${name}"`), `schema missing ${name}`);
    assert.ok(migration.includes(`"${name}"`), `migration missing ${name}`);
  }
});

test("only digest, ownership, dates and terminal flags are stored", () => {
  for (const column of ["user_id", "token_hash", "expires_at", "created_at", "consumed_at", "revoked_at"]) {
    assert.ok(migration.includes(`"${column}"`), `missing ${column}`);
  }
  assert.doesNotMatch(migration, /"(?:raw_token|token|email|password)"/i);
  assert.match(migration, /UNIQUE\("token_hash"\)/);
  assert.match(migration, /\^\[0-9a-f\]\{64\}\$/);
  assert.match(migration, /REFERENCES "public"\."users"\("id"\) ON DELETE cascade/);
});

test("one open token per user, and consumed/revoked are mutually exclusive", () => {
  assert.match(migration, /CREATE UNIQUE INDEX "password_reset_tokens_one_open_per_user_idx"[\s\S]+WHERE "consumed_at" IS NULL AND "revoked_at" IS NULL/);
  assert.match(migration, /CHECK \(NOT \("password_reset_tokens"\."consumed_at" IS NOT NULL AND "password_reset_tokens"\."revoked_at" IS NOT NULL\)\)/);
  assert.match(migration, /"expires_at" > "password_reset_tokens"\."created_at"/);
});

test("journal adds migration 0031 after 0030 without changing its history", () => {
  assert.equal(journal.dialect, "postgresql");
  assert.equal(String(journal.version), "7");
  const entries = journal.entries;
  assert.equal(entries.at(-2).idx, 30);
  assert.equal(entries.at(-2).tag, "0030_chapter_cover");
  assert.equal(entries.at(-1).idx, 31);
  assert.equal(entries.at(-1).tag, "0031_auth_password_reset_tokens");
  assert.ok(entries.at(-1).when > entries.at(-2).when);
  assert.equal(entries.at(-1).breakpoints, true);
});

test("migration is additive, no existing table rewrite or data deletion", () => {
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+)\b/im);
  assert.doesNotMatch(migration, /ALTER TABLE "(?:users|sessions|auth_rate_limits)"/);
});
