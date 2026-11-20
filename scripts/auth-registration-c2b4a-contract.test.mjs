/** AUTH-01C2B4A / no DB access: additive schema and historical safety rules. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const schema = read("src/db/schema.ts");
const sql = read("drizzle/0034_auth_registration_activation_marker.sql");
const journal = JSON.parse(read("drizzle/meta/_journal.json"));
const policy = read("src/modules/auth/registration-activation-policy.ts");
const registration = read("src/modules/auth/registration-service.ts");
const login = read("src/modules/auth/login-service.ts");
const sessions = read("src/modules/auth/session-service.ts");
const service = read("src/modules/auth/email-verification-service.ts");

test("migration adds nullable marker and default for only future rows", () => {
  assert.match(schema, /verificationRequiredAt: timestamp\("verification_required_at", \{ withTimezone: true \}\)\.defaultNow\(\)/);
  assert.match(sql, /ALTER TABLE "users" ADD COLUMN "verification_required_at" timestamp with time zone;/);
  assert.match(sql, /ALTER TABLE "users" ALTER COLUMN "verification_required_at" SET DEFAULT now\(\);/);
  assert.ok(sql.indexOf("ADD COLUMN") < sql.indexOf("SET DEFAULT"));
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|DROP|TRUNCATE|BACKFILL)\s+(?:TABLE|FROM|"users")/i);
  assert.doesNotMatch(sql, /\bNOT NULL\b/i);
});

test("0034 is an append-only migration after 0033 with stable history", () => {
  assert.equal(journal.version, "7");
  assert.equal(journal.dialect, "postgresql");
  assert.ok(journal.entries.length >= 35);
  assert.deepEqual(journal.entries.slice(31, 35).map(({idx,tag})=>[idx,tag]), [
    [31,"0031_auth_password_reset_tokens"],
    [32,"0032_auth_email_verification_state"],
    [33,"0033_auth_email_verification_tokens"],
    [34,"0034_auth_registration_activation_marker"],
  ]);
  assert.ok(journal.entries[34].when > journal.entries[33].when);
});

test("policy remains pure and does not authorize based on new marker alone", () => {
  assert.match(policy, /state === "verified" \|\| state === "legacy_unverified"/);
  assert.match(policy, /"pending"/);
  assert.doesNotMatch(policy, /@\/db|nodemailer|sendgrid|postmark|resend|process\.env/);
});

test("C2B4B gates registration, login and session while activation stays internal", () => {
  assert.match(registration, /verificationRequiredAt: new Date\(\)/);
  assert.match(login, /canUseFullAccountSession/);
  assert.match(sessions, /canUseFullAccountSession/);
  assert.match(service, /redeemEmailVerificationToken/);
  assert.doesNotMatch(service, /NextResponse|setSessionCookie/);
});
