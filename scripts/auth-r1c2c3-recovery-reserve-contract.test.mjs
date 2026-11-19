/** AUTH-01 / R1C2C3: source-only safeguards; no DB, mail, env or network. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync("drizzle/0043_auth_password_reset_operator_gate.sql", "utf8");
const prior = readFileSync("drizzle/0042_auth_password_reset_dispatch_fence.sql", "utf8");
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const schema = readFileSync("src/db/schema.ts", "utf8");
const reserve = readFileSync("src/modules/auth/password-reset-request-outbox-reserve.ts", "utf8");
const probe = readFileSync("scripts/auth-r1c2c3-recovery-reserve-pg-probe.ts", "utf8");
const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const outbox = schema.split("export const passwordResetMailOutbox = pgTable(")[1]?.split("export const activationMailOutbox = pgTable(")[0];

test("0043 is append-only and original 0042 is not rewritten", () => {
  assert.ok(journal.entries.length >= 44);
  for (let i = 0; i < 44; i++) assert.equal(journal.entries[i]?.idx, i);
  assert.equal(journal.entries[42]?.tag, "0042_auth_password_reset_dispatch_fence");
  assert.equal(journal.entries[43]?.tag, "0043_auth_password_reset_operator_gate");
  assert.match(prior, /ADD COLUMN "dispatch_fence_at"/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|UPDATE .* SET|CREATE TRIGGER/i);
});
test("control singleton is default OFF with generation zero", () => {
  assert.match(migration, /CREATE TABLE "password_reset_mail_dispatch_control"/);
  assert.match(migration, /"enabled" boolean DEFAULT false NOT NULL/);
  assert.match(migration, /"generation" integer DEFAULT 0 NOT NULL/);
  assert.match(migration, /VALUES \(1, false, 0\)/);
  assert.match(migration, /"id" = 1/);
  assert.match(migration, /"enabled" = false OR "generation" > 0/);
});
test("reservation columns and NULL-safe invariants are appended", () => {
  assert.match(migration, /ADD COLUMN "dispatch_reservation_at" timestamp with time zone/);
  assert.match(migration, /ADD COLUMN "dispatch_reservation_generation" integer/);
  assert.match(migration, /"dispatch_reservation_generation" IS NOT NULL/);
  assert.match(migration, /"dispatch_reservation_at" < "expires_at"/);
  assert.match(migration, /"dispatch_fence_at" IS NOT NULL/);
  assert.match(migration, /password_reset_mail_outbox_dispatch_reservation_presence_check/);
});
test("Drizzle schema mirrors durable independent control and irreversible reservation", () => {
  assert.ok(outbox);
  assert.match(outbox, /dispatchReservationAt: timestamp\("dispatch_reservation_at"/);
  assert.match(outbox, /dispatchReservationGeneration: integer\("dispatch_reservation_generation"/);
  assert.match(outbox, /password_reset_mail_outbox_dispatch_reservation_shape_check/);
  assert.match(outbox, /password_reset_mail_outbox_dispatch_reservation_presence_check/);
  assert.match(schema, /export const passwordResetMailDispatchControl = pgTable/);
  assert.match(schema, /password_reset_mail_dispatch_control_singleton_check/);
});
test("reservation locks control first then USER TOKEN OUTBOX", () => {
  const c = reserve.indexOf("const [control] = await tx.select");
  const u = reserve.indexOf("const [account] = await tx.select");
  const t = reserve.indexOf("const [token] = await tx.select");
  const o = reserve.indexOf("const [outbox] = await tx.select");
  assert.ok(c > 0 && c < u && u < t && t < o);
  assert.match(reserve, /passwordResetMailDispatchControl\.id, 1/);
  assert.match(reserve, /control\.enabled !== true/);
  assert.match(reserve, /control\.generation <= 0/);
  assert.match(reserve, /\.for\("update"\)/);
});
test("reservation rechecks AEAD and fences, never reads operator opt-in from caller", () => {
  assert.match(reserve, /preflightClaimedPasswordResetMailDryRun/);
  assert.match(reserve, /isNotNull\(passwordResetMailOutbox\.dispatchFenceAt\)/);
  assert.match(reserve, /isNull\(passwordResetMailOutbox\.dispatchReservationAt\)/);
  assert.match(reserve, /isNull\(passwordResetMailOutbox\.dispatchReservationGeneration\)/);
  assert.doesNotMatch(reserve, /operatorEnabled: boolean|operatorFenceEnabled: boolean/);
});
test("reservation is NOT sending and no provider key loader exists", () => {
  assert.match(reserve, /sendAuthorized: false/);
  assert.doesNotMatch(reserve, /sendAuthorized: true|fetch\(|sendMail\(|process\.env|smtp\.|resend\.|provider\.send/i);
  assert.doesNotMatch(migration, /https?:|fetch\(|sendMail\(|smtp\.|API_KEY|CREATE TRIGGER/i);
});
test("PG17 probe denies other DB targets and tests concurrent one-winner reservation", () => {
  assert.match(probe, /requireDisposableCi\(\)/);
  assert.match(probe, /GITHUB_ACTIONS/);
  assert.match(probe, /postgresql:/);
  assert.match(probe, /Promise\.all\(\[/);
  assert.match(probe, /AUTH01_R1C2C3_DISPOSABLE_PG17=PASS/);
});
test("CI schedules exact disposable PG17 reservation probe after migration", () => {
  assert.match(workflow, /image: postgres:17-alpine/);
  assert.match(workflow, /Migrate clean database and verify repeat migration/);
  assert.match(workflow, /AUTH-01 R1C2C3 disposable PostgreSQL recovery operator reservation \(NO mail\)/);
});

test("reservation without start cannot use legacy settlement or change the row", () => {
  assert.match(probe, /Reflect\.get\(claimer, "finalizeClaimedPasswordResetMail"\), undefined/);
  assert.doesNotMatch(probe, /claimer\.finalizeClaimedPasswordResetMail\s*\(/);
  assert.match(probe, /assert\.deepEqual\(await getLast\(\), unstarted\)/);
});
