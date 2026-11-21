/** Creates and drops ONLY its own disposable PG17 database. Never loads dotenv. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getTableConfig } from "drizzle-orm/pg-core";
import { emailVerificationTokens } from "../src/db/schema";
import { issueEmailVerificationToken } from "../src/modules/auth/email-verification-token";
import { sealActivationMailOutboxPayload, unsealActivationMailOutboxPayload } from "../src/modules/auth/registration-activation-outbox-crypto";

const target = process.env.PURPOSE_TEST_DATABASE_URL;
if (!target) throw new Error("PURPOSE_TEST_DATABASE_URL must explicitly select disposable PG17");
const url = new URL(target);
const local = url.hostname === "127.0.0.1" && url.port === "55526" &&
  url.username === "purpose01_qa" && url.pathname === "/purpose01_review";
const ci = process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_REPOSITORY === "Flawden/comic-diary" &&
  url.hostname === "127.0.0.1" && url.port === "5432" && url.username === "comic_diary_ci" && url.pathname === "/comic_diary_release";
if (url.protocol !== "postgresql:" || (!local && !ci) || url.search || url.hash) throw new Error("REFUSED non-disposable PG");

test("PG17 upgrade 0046 -> 0047 preserves rows, defaults, v1 jobs and all prior constraints", async t => {
  const admin = new Pool({ connectionString: target });
  const database = "auth_purpose_phase1_" + randomUUID().replaceAll("-", "");
  const folder = mkdtempSync(join(tmpdir(), "comic-diary-purpose-migration-"));
  let created = false;
  let pool: Pool | undefined;
  try {
    assert.equal((await admin.query("SELECT current_setting('server_version_num')::int / 10000 AS major")).rows[0].major, 17);
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    const isolated = new URL(target!); isolated.pathname = "/" + database;
    pool = new Pool({ connectionString: isolated.toString() });
    const db = drizzle(pool);
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    const baseline = { ...journal, entries: journal.entries.filter((e: { idx: number }) => e.idx <= 46) };
    mkdirSync(join(folder, "meta"));
    writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify(baseline));
    for (const entry of baseline.entries) copyFileSync(`drizzle/${entry.tag}.sql`, join(folder, `${entry.tag}.sql`));
    await migrate(db, { migrationsFolder: folder });

    const now = new Date();
    const challenge = issueEmailVerificationToken(now);
    const [user] = (await pool.query(`INSERT INTO users(email,password_hash,verification_required_at)
      VALUES('purpose-fixture@example.invalid','synthetic-unchanged-hash',now()) RETURNING id`)).rows;
    const [token] = (await pool.query(`INSERT INTO email_verification_tokens(user_id,email_snapshot,token_hash,created_at,expires_at)
      VALUES($1,$2,$3,$4,$5) RETURNING id`, [user.id, "purpose-fixture@example.invalid", challenge.tokenHash, now, challenge.expiresAt])).rows;
    await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)", [user.id, "b".repeat(64), challenge.expiresAt]);
    const key = { keyId: "purpose-fixture", bytes: new Uint8Array(32).fill(7) };
    const binding = { verificationTokenId: token.id, idempotencyKey: "A".repeat(32), expiresAt: challenge.expiresAt };
    const plain = { email: "purpose-fixture@example.invalid", token: challenge.token, publicOrigin: "https://reader.example.invalid", expiresAt: challenge.expiresAt };
    const envelope = sealActivationMailOutboxPayload(plain, binding, key, now);
    assert.ok(envelope);
    await pool.query(`INSERT INTO activation_mail_outbox(verification_token_id,payload_ciphertext,payload_nonce,payload_key_id,payload_digest,idempotency_key,expires_at,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8)`, [token.id, envelope.payloadCiphertext, envelope.payloadNonce, envelope.payloadKeyId, envelope.payloadDigest, binding.idempotencyKey, challenge.expiresAt, now]);
    const preservedTables = ["users", "sessions", "activation_mail_outbox"];
    const before = await Promise.all(preservedTables.map(table => pool!.query(`SELECT * FROM ${table} ORDER BY id`)));
    const oldTokens = (await pool.query("SELECT * FROM email_verification_tokens ORDER BY id")).rows;
    const constraints = async () => (await pool!.query(`SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint
      WHERE conrelid='email_verification_tokens'::regclass ORDER BY conname`)).rows;
    const oldConstraints = await constraints();
    const oldIndexes = (await pool.query("SELECT indexname,indexdef FROM pg_indexes WHERE tablename='email_verification_tokens' ORDER BY indexname")).rows;

    await t.test("upgrade and migrator replay are safe with preexisting data", async () => {
      await migrate(db, { migrationsFolder: "drizzle" });
      const applied = (await pool!.query("SELECT * FROM drizzle.__drizzle_migrations ORDER BY id")).rows;
      assert.equal(applied.length, journal.entries.length);
      await migrate(db, { migrationsFolder: "drizzle" });
      assert.deepEqual((await pool!.query("SELECT * FROM drizzle.__drizzle_migrations ORDER BY id")).rows, applied);
      for (let i = 0; i < preservedTables.length; i++) assert.deepEqual((await pool!.query(`SELECT * FROM ${preservedTables[i]} ORDER BY id`)).rows, before[i].rows);
      assert.deepEqual((await pool!.query("SELECT * FROM email_verification_tokens ORDER BY id")).rows,
        oldTokens.map(row => ({ ...row, purpose: "pending_activation" })));
      assert.deepEqual((await constraints()).filter(row => row.conname !== "email_verification_tokens_purpose_check"), oldConstraints);
      assert.deepEqual((await pool!.query("SELECT indexname,indexdef FROM pg_indexes WHERE tablename='email_verification_tokens' ORDER BY indexname")).rows, oldIndexes);
      assert.deepEqual(unsealActivationMailOutboxPayload(envelope, binding, new Map([[key.keyId, key.bytes]]), now), plain);
    });

    await t.test("old INSERT and both explicit purposes; unknown, NULL and empty fail closed", async () => {
      const insert = async (purpose?: string | null) => {
        const [owner] = (await pool!.query("INSERT INTO users(email) VALUES($1) RETURNING id", [randomUUID()+"@example.invalid"])).rows;
        const values = [owner.id, "reader@example.invalid", randomUUID().replaceAll("-", "").repeat(2), now, challenge.expiresAt];
        return purpose === undefined ? pool!.query(`INSERT INTO email_verification_tokens(user_id,email_snapshot,token_hash,created_at,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING purpose`, values)
          : pool!.query(`INSERT INTO email_verification_tokens(user_id,email_snapshot,token_hash,created_at,expires_at,purpose) VALUES($1,$2,$3,$4,$5,$6) RETURNING purpose`, [...values, purpose]);
      };
      assert.equal((await insert()).rows[0].purpose, "pending_activation");
      for (const purpose of ["pending_activation", "legacy_email_verification"]) assert.equal((await insert(purpose)).rows[0].purpose, purpose);
      for (const purpose of ["unknown", "", "PENDING_ACTIVATION"]) await assert.rejects(insert(purpose), { code: "23514", constraint: "email_verification_tokens_purpose_check" });
      await assert.rejects(insert(null), { code: "23502" });
      await assert.rejects(pool!.query("UPDATE email_verification_tokens SET purpose='unknown' WHERE id=$1", [token.id]), { code: "23514" });
    });

    await t.test("Drizzle column definitions and named checks match actual PostgreSQL", async () => {
      const config = getTableConfig(emailVerificationTokens);
      const columns = (await pool!.query(`SELECT column_name,is_nullable,data_type,character_maximum_length,column_default FROM information_schema.columns
        WHERE table_schema='public' AND table_name='email_verification_tokens' ORDER BY ordinal_position`)).rows;
      assert.deepEqual(columns.map(c => c.column_name).sort(), config.columns.map(c => c.name).sort());
      for (const column of config.columns) assert.equal(columns.find(c => c.column_name === column.name).is_nullable, column.notNull ? "NO" : "YES");
      const purpose = columns.find(c => c.column_name === "purpose");
      assert.equal(purpose.data_type, "character varying"); assert.equal(purpose.character_maximum_length, 32);
      assert.equal(purpose.column_default, "'pending_activation'::character varying");
      const actual = await constraints();
      for (const check of config.checks) assert.ok(actual.some(c => c.conname === check.name));
    });
  } finally {
    await pool?.end();
    try { if (created) await admin.query(`DROP DATABASE "${database}"`); }
    finally { await admin.end(); rmSync(folder, { recursive: true }); }
  }
});
