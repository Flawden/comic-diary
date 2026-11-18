/** R1C2C2: inert schema/lock-order contract. No DB, mail or network access. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync("drizzle/0042_auth_password_reset_dispatch_fence.sql", "utf8");
const previous = readFileSync("drizzle/0041_auth_password_reset_outbox_claim.sql", "utf8");
const schema = readFileSync("src/db/schema.ts", "utf8");
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const fence = readFileSync("src/modules/auth/password-reset-request-outbox-fence.ts", "utf8");
const probe = readFileSync("scripts/auth-r1c2c2-recovery-fence-pg-probe.ts", "utf8");
const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const slice = schema.split("export const passwordResetMailOutbox = pgTable(")[1]?.split("export const activationMailOutbox = pgTable(")[0];

test("0042 journal append preserves prior 42 indexes", () => {
  assert.equal(journal.entries.length, 43);
  for (let i = 0; i < 43; i++) assert.equal(journal.entries[i]?.idx, i);
  assert.equal(journal.entries[41].tag, "0041_auth_password_reset_outbox_claim");
  assert.equal(journal.entries[42].tag, "0042_auth_password_reset_dispatch_fence");
});
test("0041 stays independent of fence; 0042 adds nullable column only", () => {
  assert.doesNotMatch(previous, /dispatch_fence_at|dispatch_reservation_at/);
  assert.match(migration, /ADD COLUMN "dispatch_fence_at" timestamp with time zone/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|UPDATE .* SET|CREATE TRIGGER/i);
});
test("SQL check enforces claim ownership and temporal presence", () => {
  for (const term of ["dispatch_fence_at", "claim_id", "claimed_at", "created_at", "updated_at", "expires_at", "in_flight", "uncertain"]) {
    assert.ok(migration.includes(term), term);
  }
  assert.match(migration, /"dispatch_fence_at" IS NULL\s+OR/);
  assert.match(migration, /"claimed_at" IS NOT NULL/);
  assert.match(migration, /"dispatch_fence_at" < "expires_at"/);
});
test("Drizzle mirrors nullable fence and SQL check only on recovery outbox", () => {
  assert.ok(slice);
  assert.match(slice, /dispatchFenceAt: timestamp\("dispatch_fence_at"/);
  assert.match(slice, /password_reset_mail_outbox_dispatch_fence_check/);
  assert.match(slice, /\$\{table\.dispatchFenceAt\} IS NULL OR/);
});
test("fence is internal, single-claim, lock ordered and rechecks AEAD under locks", () => {
  assert.match(fence, /recordPendingRecoveryDispatchFenceOnce/);
  assert.match(fence, /preflightClaimedPasswordResetMailDryRun/);
  const account = fence.indexOf("const [account] = await tx.select");
  const token = fence.indexOf("const [token] = await tx.select");
  const outbox = fence.indexOf("const [outbox] = await tx.select");
  assert.ok(account > 0 && account < token && token < outbox);
  assert.match(fence, /isNull\(passwordResetMailOutbox\.dispatchFenceAt\)/);
  assert.match(fence, /eq\(passwordResetMailOutbox\.claimId, input\.claimId\)/);
  assert.match(fence, /operatorFenceEnabled !== true/);
});
test("a recorded fence never grants send permission or returns protected payload", () => {
  assert.match(fence, /sendAuthorized: false/);
  assert.doesNotMatch(fence, /sendAuthorized: true|fetch\(|sendMail\(|process\.env|smtp\./i);
  assert.doesNotMatch(fence, /return\s+.*payloadCiphertext|return\s+.*email|return\s+.*tokenHash/);
});
test("PG17 probe refuses unexpected URL and tests concurrency and revoke", () => {
  assert.match(probe, /requireDisposableCi\(\)/);
  assert.match(probe, /GITHUB_ACTIONS/);
  assert.match(probe, /postgresql:/);
  assert.match(probe, /Promise\.all\(\[/);
  assert.match(probe, /revoked_at=now\(\)/);
  assert.match(probe, /AUTH01_R1C2C2_DISPOSABLE_PG17=PASS/);
});
test("CI requires disposable PG17 probe after migration", () => {
  assert.match(workflow, /image: postgres:17-alpine/);
  assert.match(workflow, /Migrate clean database and verify repeat migration/);
  assert.match(workflow, /AUTH-01 R1C2C2 disposable PostgreSQL recovery dispatch fence \(NO mail\)/);
  assert.match(workflow, /run: node --import tsx scripts\/auth-r1c2c2-recovery-fence-pg-probe.ts/);
});
