import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(file, "utf8");
const schema = read("src/db/schema.ts");
const migration = read("drizzle/0033_auth_email_verification_tokens.sql");
const journal = JSON.parse(read("drizzle/meta/_journal.json"));
const primitive = read("src/modules/auth/email-verification-token.ts");

const constraintNames = [
  "email_verification_tokens_token_hash_unique",
  "email_verification_tokens_user_id_idx",
  "email_verification_tokens_expires_at_idx",
  "email_verification_tokens_one_open_per_user_idx",
  "email_verification_tokens_hash_sha256_check",
  "email_verification_tokens_expiry_check",
  "email_verification_tokens_one_terminal_state_check",
];

test("additive table, email snapshot, and named constraints match schema", () => {
  assert.match(schema, /export const emailVerificationTokens = pgTable\(\s*"email_verification_tokens"/);
  assert.match(migration, /CREATE TABLE "email_verification_tokens"/);
  for (const name of constraintNames) {
    assert.ok(schema.includes(`"${name}"`), `schema missing ${name}`);
    assert.ok(migration.includes(`"${name}"`), `migration missing ${name}`);
  }
  for (const column of ["user_id", "email_snapshot", "token_hash", "expires_at", "consumed_at", "revoked_at", "created_at"]) {
    assert.ok(migration.includes(`"${column}"`), `missing ${column}`);
  }
  assert.doesNotMatch(migration, /"(?:raw_token|token|password)"/i);
  assert.match(migration, /REFERENCES "public"\."users"\("id"\) ON DELETE cascade/);
});

test("one open token per user, expiry, and terminal state DB guards", () => {
  assert.match(migration, /CREATE UNIQUE INDEX "email_verification_tokens_one_open_per_user_idx"[\s\S]+WHERE "consumed_at" IS NULL AND "revoked_at" IS NULL/);
  assert.match(migration, /"expires_at" > "email_verification_tokens"\."created_at"/);
  assert.match(migration, /"email_verification_tokens_one_terminal_state_check" CHECK \(NOT \(/);
  assert.match(migration, /"consumed_at" IS NOT NULL AND "email_verification_tokens"\."revoked_at" IS NOT NULL/);
});

test("0033 is appended after 0032, without rewriting historical migrations", () => {
  assert.equal(journal.version, "7");
  assert.equal(journal.dialect, "postgresql");
  assert.equal(journal.entries.length, 34);
  assert.deepEqual(journal.entries.slice(-3).map((e) => [e.idx, e.tag]), [
    [31, "0031_auth_password_reset_tokens"],
    [32, "0032_auth_email_verification_state"],
    [33, "0033_auth_email_verification_tokens"],
  ]);
  assert.ok(journal.entries[33].when > journal.entries[32].when);
  assert.equal(journal.entries[33].breakpoints, true);
});

test("no DB access, route, auto-verification or transport is enabled", () => {
  assert.doesNotMatch(migration, /^\s*(?:UPDATE|DELETE|DROP|TRUNCATE)\b/im);
  assert.doesNotMatch(migration, /ALTER TABLE "users"/);
  assert.doesNotMatch(primitive, /@\/db|nodemailer|sendgrid|postmark|resend|process\.env/);
  assert.doesNotMatch(primitive, /emailVerifiedAt|update\(users\)/);
});
