/** AUTH-01C2B4D2C4B3B2 structural contract ONLY; no DB, env or transport. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const fence = read("src/modules/auth/registration-activation-outbox-fence.ts");
const schema = read("src/db/schema.ts");
const migration = read("drizzle/0036_auth_activation_dispatch_fence.sql");
const journal = JSON.parse(read("drizzle/meta/_journal.json"));
const workflow = read(".github/workflows/ci.yml");
const old0035 = read("drizzle/0035_auth_activation_mail_outbox.sql");
const oldContract = read("scripts/auth-registration-c2b4d2c1-contract.test.mjs");
const dryRun = read("src/modules/auth/registration-activation-outbox-dry-run.ts");
const pgProbe = read("scripts/auth-registration-c2b4d2c4b3b2-pg-probe.ts");

const fnh = fence.slice(fence.indexOf("export async function recordPendingActivationDispatchFenceOnce"));
const trans = fnh.slice(fnh.indexOf("return db.transaction"));

test("historical 0035 remains byte-for-byte unmodified", () => {
  assert.equal(createHash("sha256").update(old0035).digest("hex"), "3384762d2aab3b32cf1f7d9dc26471761d41845289f5d67ff075a4c41f8ba71a");
});
test("0036 migration append-only: one nullable fence timestamp, one check, no implicit sending", () => {
  assert.match(migration, /ALTER TABLE "activation_mail_outbox" ADD COLUMN "dispatch_fence_at" timestamp with time zone;/);
  assert.match(migration, /ADD CONSTRAINT "activation_mail_outbox_dispatch_fence_shape_check" CHECK/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT|CREATE\s+TRIGGER)\b/im);
  assert.equal((migration.match(/ALTER TABLE/g) ?? []).length, 2);
});
test("0036 schema mirrors nullable marker and preserved old state check", () => {
  assert.match(schema, /dispatchFenceAt: timestamp\("dispatch_fence_at", \{ withTimezone: true \}\)/);
  assert.match(schema, /check\("activation_mail_outbox_dispatch_fence_shape_check"/);
  assert.match(schema, /check\("activation_mail_outbox_state_shape_check"/);
  assert.match(schema, /dispatchFenceAt} IS NULL OR/);
});
test("new constraint restricts fenced states, owner claim, chronological validity", () => {
  for (const clause of [
    /"state" IN \('in_flight', 'accepted', 'rejected', 'uncertain'\)/,
    /"attempt_count" = 1/,
    /"claim_id" IS NOT NULL/,
    /"claimed_at" IS NOT NULL/,
    /"dispatch_fence_at" >= "claimed_at"/,
    /"dispatch_fence_at" < "expires_at"/,
    /"updated_at" >= "dispatch_fence_at"/,
  ]) assert.match(migration, clause);
});
test("journal 0036 exact tail, historical journal prefix 0000..0035 untouched", () => {
  assert.equal(journal.entries.length, 37);
  assert.deepEqual(journal.entries.slice(-2).map((e) => [e.idx, e.tag]), [
    [35,"0035_auth_activation_mail_outbox"],
    [36,"0036_auth_activation_dispatch_fence"],
  ]);
  assert.ok(journal.entries[36].when > journal.entries[35].when);
  assert.match(oldContract, /journal\.entries\.slice\(31,36\)/);
  assert.match(oldContract, /journal\.entries\.length >= 36/);
});
test("internal-only function has NO send, provider, API, environment or secret loading", () => {
  assert.match(fence, /INTERNAL DATABASE FENCE ONLY/);
  assert.doesNotMatch(fence, /\bfetch\s*\(|\bsendEmail\s*\(|\bprocess\.env\b|\bnew\s+Pool\s*\(/);
  assert.doesNotMatch(fence, /@\/shared\/config\/env|\.\/registration-activation-sender|\.\/registration-activation-resend-contract/);
  assert.ok(!fence.includes("sendAuthorized: true"));
});
test("fence result is always no-send and excludes address, raw token and ciphertext", () => {
  assert.match(fence, /fenceRecorded: true; sendAuthorized: false/);
  assert.match(fence, /kind: "blocked"; sendAuthorized: false/);
  assert.match(fence, /const RECORDED: FenceRecorded = Object\.freeze\(/);
  assert.doesNotMatch(fence, /return.*payloadCiphertext|return.*plaintext|return.*recipient/);
});
test("internal operator switch is default closed and caller inputs strictly shaped", () => {
  assert.match(fence, /Object\.keys\(input\)\.length !== 5/);
  assert.match(fence, /input\.operatorFenceEnabled !== true/);
  assert.match(fence, /input\.keys instanceof Map/);
  assert.match(fence, /canonicalClaimId\(input\.claimId\)/);
});
test("advisory candidate lookup is not authorization", () => {
  assert.match(fence, /Advisory discovery ONLY/);
  assert.ok(fnh.indexOf(".innerJoin(") < fnh.indexOf("return db.transaction"));
  assert.match(trans, /account\.id !== candidate\.userId/);
  assert.match(trans, /token\.id !== candidate\.tokenId/);
});
test("fence locks USER then TOKEN then OUTBOX in a single transaction", () => {
  const pos=[trans.indexOf(".from(users)"),trans.indexOf(".from(emailVerificationTokens)"),trans.indexOf(".from(activationMailOutbox)")];
  assert.ok(pos.every((p)=>p>=0) && pos[0]<pos[1] && pos[1]<pos[2]);
  assert.equal((trans.match(/\.for\("update"\)/g) ?? []).length, 3);
});
test("preflight validates matching claim, token, origin, recipient and AEAD under locks", () => {
  assert.match(trans, /preflightClaimedActivationMailDryRun\(/);
  assert.match(trans, /snapshot: \{ account, token, outbox \}/);
  assert.match(trans, /expectedPublicOrigin: input\.expectedPublicOrigin/);
  assert.match(trans, /keys: input\.keys/);
  assert.match(dryRun, /unsealActivationMailOutboxPayload\(/);
  assert.match(dryRun, /token\.emailSnapshot !== account\.email/);
  assert.match(dryRun, /sameHash\(token\.tokenHash, hashEmailVerificationToken/);
});
test("fence cannot be rewritten/replayed or added after a terminal state", () => {
  assert.match(trans, /outbox\.dispatchFenceAt !== null/);
  assert.match(trans, /isNull\(activationMailOutbox\.dispatchFenceAt\)/);
  assert.match(trans, /eq\(activationMailOutbox\.state, "in_flight"\)/);
  assert.match(trans, /eq\(activationMailOutbox\.claimId, input\.claimId\)/);
  assert.match(trans, /return changed\.length === 1 \? RECORDED : BLOCKED/);
});
test("previous B1 dry-run remains no-send and independent", () => {
  assert.match(dryRun, /sendAuthorized: false/);
  assert.doesNotMatch(dryRun, /sendAuthorized: true/);
});
test("CI uses separate offline test and PG test on disposable Postgres only", () => {
  assert.match(workflow, /AUTH-01C2B4D2C4B3B2 durable DB dispatch fence contract \(NO delivery\)/);
  assert.match(workflow, /node --test scripts\/auth-registration-c2b4d2c4b3b2-contract\.test\.mjs/);
  assert.match(workflow, /AUTH-01C2B4D2C4B3B2 disposable PostgreSQL fence concurrency \(NO delivery\)/);
  assert.match(workflow, /node --import tsx scripts\/auth-registration-c2b4d2c4b3b2-pg-probe\.ts/);
  assert.match(workflow, /run: npm run lint/);
  assert.match(workflow, /run: npm run typecheck/);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/master'/);
});
test("PG probe guards exact CI URI BEFORE service import and pool creation", () => {
  for (const word of ["GITHUB_ACTIONS","GITHUB_REPOSITORY","GITHUB_WORKFLOW","comic_diary_ci","ci_ephemeral_password","127.0.0.1","comic_diary_release","REFUSED"]) {
    assert.ok(pgProbe.includes(word),word);
  }
  const guard = pgProbe.indexOf("const connectionString = requireDisposableCiDatabase();");
  const imp = pgProbe.indexOf('import("../src/modules/auth/registration-activation-outbox-fence")');
  const pool = pgProbe.indexOf("new Pool({");
  assert.ok(guard>=0 && imp>guard && pool>guard);
  assert.doesNotMatch(pgProbe,/\bfetch\s*\(|\bsendEmail\s*\(/);
});
test("no automatic retries or claimed->ready transitions added", () => {
  assert.doesNotMatch(fence,/\bretry\s*\(|state:\s*"ready"|state:\s*"accepted"/);
  assert.match(fence,/strict guarantee B .* is not established/);
});
