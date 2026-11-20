import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(path, "utf8");
const json = path => JSON.parse(read(path));
const previous = json("drizzle/meta/0046_snapshot.json");
const current = json("drizzle/meta/0047_snapshot.json");
const journal = json("drizzle/meta/_journal.json");

test("0047 snapshot adds only purpose and its check; all historical schema survives", () => {
  assert.equal(current.prevId, previous.id);
  assert.notEqual(current.id, previous.id);
  const expected = structuredClone(previous);
  expected.prevId = previous.id;
  expected.id = current.id;
  const table = expected.tables["public.email_verification_tokens"];
  table.columns.purpose = { name: "purpose", type: "varchar(32)", primaryKey: false,
    notNull: true, default: "'pending_activation'" };
  table.checkConstraints.email_verification_tokens_purpose_check = {
    name: "email_verification_tokens_purpose_check",
    value: '"email_verification_tokens"."purpose" IN (\'pending_activation\', \'legacy_email_verification\')',
  };
  assert.deepEqual(current, expected);
});

test("0047 is additive SQL with a strict two-purpose allowlist and an ordered journal entry", () => {
  const sql = read("drizzle/0047_auth_verification_purpose.sql");
  assert.match(sql, /ADD COLUMN "purpose" varchar\(32\) DEFAULT 'pending_activation' NOT NULL/);
  assert.match(sql, /CHECK \("email_verification_tokens"\."purpose" IN \('pending_activation', 'legacy_email_verification'\)\)/);
  assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE|DROP|TRUNCATE|INSERT)\b/im);
  assert.equal((sql.match(/ALTER TABLE/g) ?? []).length, 2);
  const entry = journal.entries.find(entry => entry.idx === 47);
  assert.deepEqual(entry, { idx: 47, version: "7", when: 1795132800000,
    tag: "0047_auth_verification_purpose", breakpoints: true });
  assert.ok(entry.when > journal.entries[46].when);
});

test("schema and CI include the new foundation without changing runtime authorization", () => {
  const schema = read("src/db/schema.ts");
  assert.match(schema, /purpose: varchar\("purpose", \{ length: 32 \}\)\.notNull\(\)\.default\("pending_activation"\)/);
  assert.match(schema, /email_verification_tokens_purpose_check/);
  const ci = read(".github/workflows/ci.yml");
  assert.ok(ci.includes("node --test scripts/auth-verification-purpose-contract.test.mjs"));
  assert.ok(ci.includes("node --import tsx --test scripts/auth-verification-purpose-pg.test.ts"));
});
