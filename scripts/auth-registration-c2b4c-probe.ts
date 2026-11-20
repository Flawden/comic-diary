/**
 * AUTH-01C2B4C: disposable PostgreSQL 17 integration ONLY.
 * Refuses all non-exact CI targets BEFORE loading application DB services.
 * No production/remote DB, emails, web routes, cookies or deploys.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";

function assertDisposableCiTarget(): string {
  const url = process.env.DATABASE_URL;
  if (!url ||
      process.env.GITHUB_ACTIONS !== "true" ||
      process.env.GITHUB_REPOSITORY !== "Flawden/comic-diary" ||
      process.env.GITHUB_WORKFLOW !== "CI") {
    throw new Error("REFUSED: disposable GitHub CI PostgreSQL only");
  }
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { throw new Error("REFUSED: invalid CI database address"); }
  if (parsed.protocol !== "postgresql:" || parsed.hostname !== "127.0.0.1" ||
      parsed.port !== "5432" || parsed.pathname !== "/comic_diary_release" ||
      parsed.username !== "comic_diary_ci" ||
      parsed.password !== "ci_ephemeral_password" ||
      parsed.search !== "" || parsed.hash !== "") {
    throw new Error("REFUSED: non-disposable PostgreSQL target");
  }
  return url;
}

type Row = { id: number; email: string };
type TokenState = { consumed_at: Date | null; revoked_at: Date | null };

async function main(): Promise<void> {
  const connectionString = assertDisposableCiTarget();
  const { hashPassword, verifyPassword } = await import("../src/modules/auth/password");
  const { issueEmailVerificationForUser, redeemEmailVerificationToken } =
    await import("../src/modules/auth/email-verification-service");
  const { activatePendingRegistrationWithEmailToken } =
    await import("../src/modules/auth/registration-activation-service");

  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
  const usersCreated: number[] = [];
  let rollbackTrigger = false;
  let rollbackFunction = false;
  const initialPassword = "old-pre-verification-credential-123";
  const replacementPassword = "owner-chosen-post-verification-456";
  const initialHash = await hashPassword(initialPassword);

  async function addUser(tag: string, pending = true): Promise<Row> {
    const email = `auth01c2b4c-${tag}-${randomUUID()}@example.invalid`;
    const { rows } = await pool.query<Row>(
      `INSERT INTO users (email, password_hash, role, is_active, verification_required_at)
       VALUES ($1, $2, 'USER', true, $3)
       RETURNING id, email`,
      [email, initialHash, pending ? new Date() : null],
    );
    assert.ok(rows[0]);
    usersCreated.push(rows[0].id);
    return rows[0];
  }
  async function issue(userId: number): Promise<string> {
    const result = await issueEmailVerificationForUser(userId);
    assert.equal(result.ok, true, "token issuance should succeed");
    if (!result.ok) throw new Error("token issuance failed");
    return result.token;
  }
  async function account(userId: number) {
    const { rows } = await pool.query<{
      password_hash: string; email_verified_at: Date | null;
      verification_required_at: Date | null;
    }>(
      "SELECT password_hash, email_verified_at, verification_required_at FROM users WHERE id = $1",
      [userId],
    );
    assert.ok(rows[0]);
    return rows[0];
  }
  async function tokenState(userId: number): Promise<TokenState[]> {
    const { rows } = await pool.query<TokenState>(
      "SELECT consumed_at, revoked_at FROM email_verification_tokens WHERE user_id = $1 ORDER BY id",
      [userId],
    );
    return rows;
  }
  try {
    const { rows: versions } = await pool.query<{ major: number }>(
      "SELECT current_setting('server_version_num')::int / 10000 AS major",
    );
    assert.equal(versions[0]?.major, 17);

    // A malicious initial registration cannot be 'activated' by the legacy flow.
    const pending = await addUser("primary");
    const token = await issue(pending.id);
    assert.deepEqual(await redeemEmailVerificationToken(token), { ok: false, kind: "invalid_token" });
    assert.equal((await account(pending.id)).email_verified_at, null);
    const staleSessionHash = createHash("sha256").update(randomUUID()).digest("hex");
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '1 day')`,
      [pending.id, staleSessionHash],
    );
    assert.deepEqual(await activatePendingRegistrationWithEmailToken(token, "short"),
      { ok: false, kind: "weak_password" });
    assert.equal((await account(pending.id)).email_verified_at, null);
    const result = await activatePendingRegistrationWithEmailToken(token, replacementPassword);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("pending activation failed");
    assert.equal(result.sessionsRevoked, 1);
    const after = await account(pending.id);
    assert.ok(after.email_verified_at instanceof Date);
    assert.ok(after.verification_required_at instanceof Date);
    assert.equal(await verifyPassword(after.password_hash, initialPassword), false);
    assert.equal(await verifyPassword(after.password_hash, replacementPassword), true);
    const { rows: stale } = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM sessions WHERE user_id = $1", [pending.id]);
    assert.equal(stale[0]?.count, "0");
    assert.ok((await tokenState(pending.id))[0].consumed_at instanceof Date);
    assert.deepEqual(await activatePendingRegistrationWithEmailToken(token, replacementPassword),
      { ok: false, kind: "invalid_token" });
    console.log("AUTH01C2B4C_NEW_PASSWORD_REPLACES_INITIAL=PASS");

    // Exactly one concurrent activation may consume a challenge.
    const racing = await addUser("race");
    const raceToken = await issue(racing.id);
    const outcomes = await Promise.all([
      activatePendingRegistrationWithEmailToken(raceToken, "owner-race-credential-one-123"),
      activatePendingRegistrationWithEmailToken(raceToken, "owner-race-credential-two-123"),
    ]);
    assert.equal(outcomes.filter((r) => r.ok).length, 1);
    assert.equal(outcomes.filter((r) => !r.ok && r.kind === "invalid_token").length, 1);
    const raceHash = (await account(racing.id)).password_hash;
    const passA = await verifyPassword(raceHash, "owner-race-credential-one-123");
    const passB = await verifyPassword(raceHash, "owner-race-credential-two-123");
    assert.notEqual(passA, passB);
    console.log("AUTH01C2B4C_CONCURRENT_ACTIVATION=PASS");

    // Legacy mailbox proof remains separate and cannot change its password.
    const legacy = await addUser("legacy", false);
    const legacyToken = await issue(legacy.id);
    assert.deepEqual(await activatePendingRegistrationWithEmailToken(legacyToken, replacementPassword),
      { ok: false, kind: "invalid_token" });
    assert.deepEqual(await redeemEmailVerificationToken(legacyToken), { ok: true });
    const legacyAfter = await account(legacy.id);
    assert.ok(legacyAfter.email_verified_at instanceof Date);
    assert.equal(legacyAfter.password_hash, initialHash);
    console.log("AUTH01C2B4C_LEGACY_PENDING_SEPARATION=PASS");

    const expired = await addUser("expired");
    const expiredToken = await issue(expired.id);
    await pool.query(
      `UPDATE email_verification_tokens SET created_at = now() - interval '31 minutes',
       expires_at = now() - interval '1 minute' WHERE user_id = $1`, [expired.id]);
    assert.deepEqual(await activatePendingRegistrationWithEmailToken(expiredToken, replacementPassword),
      { ok: false, kind: "invalid_token" });
    assert.equal((await account(expired.id)).email_verified_at, null);

    const changed = await addUser("email-changed");
    const changedToken = await issue(changed.id);
    await pool.query("UPDATE users SET email = $1 WHERE id = $2",
      [`auth01c2b4c-new-${randomUUID()}@example.invalid`, changed.id]);
    assert.deepEqual(await activatePendingRegistrationWithEmailToken(changedToken, replacementPassword),
      { ok: false, kind: "invalid_token" });

    const inactive = await addUser("inactive");
    const inactiveToken = await issue(inactive.id);
    await pool.query("UPDATE users SET is_active = false WHERE id = $1", [inactive.id]);
    assert.deepEqual(await activatePendingRegistrationWithEmailToken(inactiveToken, replacementPassword),
      { ok: false, kind: "invalid_token" });
    console.log("AUTH01C2B4C_EXPIRY_EMAIL_GATES=PASS");

    // Transaction rollback must restore a consumed challenge if account UPDATE fails.
    const blocked = await addUser("rollback");
    const blockedToken = await issue(blocked.id);
    await pool.query(`
      CREATE FUNCTION comic_diary_c2b4c_block_activate() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id = ${blocked.id} AND NEW.email_verified_at IS NOT NULL THEN
          RETURN NULL;
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    rollbackFunction = true;
    await pool.query(`
      CREATE TRIGGER comic_diary_c2b4c_block_activate_trigger
      BEFORE UPDATE OF email_verified_at ON users
      FOR EACH ROW EXECUTE FUNCTION comic_diary_c2b4c_block_activate()
    `);
    rollbackTrigger = true;
    await assert.rejects(
      activatePendingRegistrationWithEmailToken(blockedToken, replacementPassword),
      /Pending account activation did not persist/,
    );
    assert.equal((await tokenState(blocked.id))[0].consumed_at, null);
    assert.equal((await account(blocked.id)).email_verified_at, null);
    await pool.query("DROP TRIGGER comic_diary_c2b4c_block_activate_trigger ON users");
    rollbackTrigger = false;
    await pool.query("DROP FUNCTION comic_diary_c2b4c_block_activate()");
    rollbackFunction = false;
    const recovered = await activatePendingRegistrationWithEmailToken(blockedToken, replacementPassword);
    assert.equal(recovered.ok, true);
    console.log("AUTH01C2B4C_ROLLBACK=PASS");
    console.log("AUTH01C2B4C_DISPOSABLE_PG_INTEGRATION=PASS");
  } finally {
    try {
      if (rollbackTrigger) await pool.query(
        "DROP TRIGGER IF EXISTS comic_diary_c2b4c_block_activate_trigger ON users");
      if (rollbackFunction) await pool.query(
        "DROP FUNCTION IF EXISTS comic_diary_c2b4c_block_activate()");
      if (usersCreated.length) await pool.query(
        "DELETE FROM users WHERE id = ANY($1::int[])", [usersCreated]);
    } finally {
      await pool.end();
    }
  }
}

main().catch((error: unknown) => {
  // No tokens, SQL payloads or connection credentials in CI diagnostics.
  console.error("AUTH01C2B4C_DISPOSABLE_PG_PROBE_FAILED",
    error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
});
