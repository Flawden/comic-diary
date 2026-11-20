/** R1C2B1: source-only contract; never connects to a database or mail provider. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync("drizzle/0041_auth_password_reset_outbox_claim.sql", "utf8");
const initial = readFileSync("drizzle/0040_auth_password_reset_mail_outbox.sql", "utf8");
const schema = readFileSync("src/db/schema.ts", "utf8");
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const slice = schema.split("export const passwordResetMailOutbox = pgTable(")[1]?.split("export const activationMailOutbox = pgTable(")[0];

test("journal preserves the original position of 0041 and 42 prior entries", () => {
  assert.ok(journal.entries.length >= 42);
  for (let i = 0; i < 42; i++) assert.equal(journal.entries[i].idx, i);
  assert.equal(journal.entries[40].tag, "0040_auth_password_reset_mail_outbox");
  assert.equal(journal.entries[41].tag, "0041_auth_password_reset_outbox_claim");
});
test("0040 stays initial ready/expired-only and 0041 is additive", () => {
  assert.doesNotMatch(initial, /in_flight|accepted|claim_id/);
  assert.match(migration, /ADD COLUMN "claim_id" varchar\(64\)/);
  assert.match(migration, /ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL/);
  assert.match(migration, /ADD COLUMN "claimed_at" timestamp with time zone/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|UPDATE .* SET/i);
});
test("one immutable claim, no auto retry or second delivery", () => {
  assert.match(migration, /"password_reset_mail_outbox_claim_unique" UNIQUE \(\"claim_id\"\)/);
  assert.match(migration, /"claim_id" ~ '\^\[A-Za-z0-9_-\]\{32\}\$'/);
  assert.match(migration, /"attempt_count" = 1/);
  assert.match(migration, /"state" = 'in_flight'/);
  assert.match(migration, /"state" IN \('accepted', 'rejected', 'uncertain'\)/);
  assert.doesNotMatch(migration, /requeue|retry|resend|pg_cron/i);
});
test("ready/expired historical rows remain legal and terminal rows require timestamps", () => {
  assert.match(migration, /"state" = 'ready' AND "claim_id" IS NULL AND "claimed_at" IS NULL AND "attempt_count" = 0 AND "finalized_at" IS NULL/);
  assert.match(migration, /"state" = 'expired' AND "claim_id" IS NULL AND "claimed_at" IS NULL AND "attempt_count" = 0 AND "finalized_at" IS NOT NULL/);
  assert.match(migration, /"state" IN \('accepted', 'rejected', 'uncertain'\).*"finalized_at" IS NOT NULL/);
  assert.match(migration, /"claimed_at" >= "created_at"/);
});
test("schema describes exactly 0041 claim fields and checks", () => {
  assert.ok(slice);
  for (const name of ['claimId: varchar("claim_id"', 'attemptCount: integer("attempt_count"', 'claimedAt: timestamp("claimed_at"',
    'password_reset_mail_outbox_claim_unique', 'password_reset_mail_outbox_claim_id_check', 'password_reset_mail_outbox_claim_times_check']) {
    assert.ok(slice.includes(name), name);
  }
  assert.match(slice, /\$\{table.state\} = 'in_flight'/);
  assert.match(slice, /\$\{table.state\} IN \('accepted', 'rejected', 'uncertain'\)/);
});
test("no sender, network, secrets, worker, dispatch authorization or data mutation", () => {
  assert.doesNotMatch(migration, /https?:|fetch\(|sendmail|smtp|resend|credential|API_KEY|NOTIFY|LISTEN|CREATE TRIGGER/i);
  assert.doesNotMatch(migration, /dispatchReservationAt|dispatchFenceAt|providerMessageId|sendMail|process\.env/);
  assert.doesNotMatch(slice, /sendMail|process\.env/);
});
