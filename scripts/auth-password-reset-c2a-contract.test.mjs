import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(file, "utf8");
const schema = read("src/db/schema.ts");
const migration = read("drizzle/0032_auth_email_verification_state.sql");
const journal = JSON.parse(read("drizzle/meta/_journal.json"));
const service = read("src/modules/auth/password-reset-service.ts");
const probe = read("scripts/auth-password-reset-probe.ts");

// These are contract checks; the disposable PostgreSQL probe is the behavioral gate.
test("emailVerifiedAt has an additive nullable PostgreSQL column", () => {
  assert.match(schema, /emailVerifiedAt: timestamp\("email_verified_at", \{ withTimezone: true \}\)/);
  assert.match(migration, /ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;/);
  assert.doesNotMatch(migration, /\b(?:UPDATE|DELETE|DROP|TRUNCATE)\s+(?:TABLE|FROM|"users")/i);
  assert.doesNotMatch(migration, /\b(?:NOT NULL|DEFAULT|USING)\b/i);
});

test("migration journal preserves previous 32 stages and appends 0032", () => {
  assert.equal(journal.version, "7");
  assert.equal(journal.dialect, "postgresql");
  assert.equal(journal.entries.length, 33);
  assert.deepEqual(journal.entries.slice(-2).map((e) => [e.idx, e.tag]), [
    [31, "0031_auth_password_reset_tokens"],
    [32, "0032_auth_email_verification_state"],
  ]);
});

test("issuance and redemption both require a verified mailbox", () => {
  assert.equal((service.match(/emailVerifiedAt: users\.emailVerifiedAt/g) ?? []).length, 2);
  assert.equal((service.match(/account\.emailVerifiedAt === null/g) ?? []).length, 2);
  assert.match(service, /\.for\("update"\)/);
});

test("disposable PG probe rejects unverified issuance and redemption", () => {
  assert.match(probe, /AUTH01C2A_MAILBOX_TRUST_GATE=PASS/);
  assert.match(probe, /initiallyUnverified/);
  assert.match(probe, /toUnverify/);
  assert.match(probe, /email_verified_at = NULL/);
  assert.match(probe, /email_verified_at = now\(\)/);
});
