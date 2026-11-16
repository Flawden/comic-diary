/**
 * AUTH-01C2B3: REAL PostgreSQL integration of the internal mailbox-verification
 * lifecycle. Refuses to run outside the explicit disposable GitHub CI database.
 * No public API, email delivery, session issuance or production access.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { hashEmailVerificationToken } from "../src/modules/auth/email-verification-token";
import type { EmailVerificationIssueResult as IssueResult } from "../src/modules/auth/email-verification-service";

type AccountRow = { id: number; email: string };
type TokenRow = {
  token_hash: string;
  email_snapshot: string;
  consumed_at: Date | null;
  revoked_at: Date | null;
};

function assertDisposableCiTarget(): string {
  const url = process.env.DATABASE_URL;
  if (
    !url ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_REPOSITORY !== "Flawden/comic-diary" ||
    process.env.GITHUB_WORKFLOW !== "CI"
  ) {
    throw new Error("REFUSED: requires the exact repository's disposable GitHub CI database");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("REFUSED: invalid CI database address");
  }
  if (
    parsed.protocol !== "postgresql:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "5432" ||
    parsed.pathname !== "/comic_diary_release" ||
    parsed.username !== "comic_diary_ci" ||
    parsed.password !== "ci_ephemeral_password" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error("REFUSED: non-disposable PostgreSQL target");
  }
  return url;
}

function expectIssued(result: IssueResult): asserts result is Extract<IssueResult, { ok: true }> {
  assert.equal(result.ok, true, "expected issue success");
}

function expectInvalid(result: { ok: boolean; kind?: string }): void {
  assert.equal(result.ok, false, "expected invalid/replayed token to be rejected");
  assert.equal(result.kind, "invalid_token");
}

function expectUnavailable(result: IssueResult): void {
  if (result.ok) throw new Error("Unexpected verification issuance to ineligible account");
  assert.equal(result.kind, "account_unavailable");
}

async function main(): Promise<void> {
  const connectionString = assertDisposableCiTarget();
  // Load the DB service only AFTER refusing unsafe environments.
  const { issueEmailVerificationForUser, redeemEmailVerificationToken } =
    await import("../src/modules/auth/email-verification-service");

  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
  const fixtureIds: number[] = [];
  let rollbackTriggerInstalled = false;
  let rollbackFunctionInstalled = false;

  async function addAccount(tag: string): Promise<AccountRow> {
    const email = `auth01c2b3-${tag}-${randomUUID()}@example.invalid`;
    const { rows } = await pool.query<AccountRow>(
      "INSERT INTO users (email, password_hash, role, is_active, verification_required_at) VALUES ($1, $2, 'USER', true, NULL) RETURNING id, email",
      [email, "ci-only-internal-test-password-hash"],
    );
    assert.ok(rows[0]);
    fixtureIds.push(rows[0].id);
    return rows[0];
  }

  async function tokenRows(userId: number): Promise<TokenRow[]> {
    const { rows } = await pool.query<TokenRow>(
      `SELECT token_hash, email_snapshot, consumed_at, revoked_at
       FROM email_verification_tokens WHERE user_id = $1 ORDER BY id`,
      [userId],
    );
    return rows;
  }

  async function verifiedAt(userId: number): Promise<Date | null> {
    const { rows } = await pool.query<{ email_verified_at: Date | null }>(
      "SELECT email_verified_at FROM users WHERE id = $1", [userId],
    );
    assert.ok(rows[0]);
    return rows[0].email_verified_at;
  }

  try {
    const server = await pool.query<{ major: number }>(
      "SELECT current_setting('server_version_num')::int / 10000 AS major",
    );
    assert.equal(server.rows[0]?.major, 17, "requires PostgreSQL 17 CI service");

    expectUnavailable(await issueEmailVerificationForUser(0));
    expectInvalid(await redeemEmailVerificationToken("invalid"));

    // Initial mailbox ownership is NEVER assumed. Only digests are persisted.
    const primary = await addAccount("primary");
    assert.equal(await verifiedAt(primary.id), null);
    const first = await issueEmailVerificationForUser(primary.id);
    expectIssued(first);
    assert.equal(first.email, primary.email);
    assert.equal(first.token.length, 43);
    assert.equal((await tokenRows(primary.id)).length, 1);
    const firstRow = (await tokenRows(primary.id))[0];
    assert.equal(firstRow.token_hash, hashEmailVerificationToken(first.token));
    assert.equal(firstRow.email_snapshot, primary.email);
    assert.equal(firstRow.consumed_at, null);
    assert.equal(firstRow.revoked_at, null);
    assert.equal(await verifiedAt(primary.id), null);

    // A second issue invalidates the first challenge, even before its expiry.
    const second = await issueEmailVerificationForUser(primary.id);
    expectIssued(second);
    let rows = await tokenRows(primary.id);
    assert.equal(rows.length, 2);
    assert.ok(rows[0].revoked_at instanceof Date);
    assert.equal(rows[1].revoked_at, null);
    expectInvalid(await redeemEmailVerificationToken(first.token));
    assert.deepEqual(await redeemEmailVerificationToken(second.token), { ok: true });
    assert.ok((await verifiedAt(primary.id)) instanceof Date);
    rows = await tokenRows(primary.id);
    assert.ok(rows[1].consumed_at instanceof Date);
    assert.equal(rows[1].revoked_at, null);
    expectInvalid(await redeemEmailVerificationToken(second.token));
    expectUnavailable(await issueEmailVerificationForUser(primary.id));
    console.log("AUTH01C2B3_ISSUE_REVOKE_REDEEM_REPLAY=PASS");

    // Concurrent consumers race on the same real row lock: exactly one wins.
    const racing = await addAccount("race");
    const raceIssue = await issueEmailVerificationForUser(racing.id);
    expectIssued(raceIssue);
    const raceResults = await Promise.all([
      redeemEmailVerificationToken(raceIssue.token),
      redeemEmailVerificationToken(raceIssue.token),
    ]);
    assert.equal(raceResults.filter((r) => r.ok).length, 1);
    assert.equal(raceResults.filter((r) => !r.ok && r.kind === "invalid_token").length, 1);
    assert.ok((await verifiedAt(racing.id)) instanceof Date);
    assert.equal((await tokenRows(racing.id)).filter((r) => r.consumed_at !== null).length, 1);
    console.log("AUTH01C2B3_CONCURRENT_REDEEM=PASS");

    // Concurrent issues leave only one open challenge (partial unique index).
    const multi = await addAccount("concurrent-issue");
    const issued = await Promise.all([
      issueEmailVerificationForUser(multi.id),
      issueEmailVerificationForUser(multi.id),
      issueEmailVerificationForUser(multi.id),
    ]);
    issued.forEach(expectIssued);
    const issuedRows = await tokenRows(multi.id);
    assert.equal(issuedRows.length, 3);
    const openRows = issuedRows.filter((r) => !r.consumed_at && !r.revoked_at);
    assert.equal(openRows.length, 1);
    for (const item of issued) {
      if (!item.ok) throw new Error("inconsistent issue result");
      if (hashEmailVerificationToken(item.token) === openRows[0].token_hash) {
        assert.deepEqual(await redeemEmailVerificationToken(item.token), { ok: true });
      } else {
        expectInvalid(await redeemEmailVerificationToken(item.token));
      }
    }
    assert.ok((await verifiedAt(multi.id)) instanceof Date);
    console.log("AUTH01C2B3_CONCURRENT_ISSUE=PASS");

    // An expired token, changed address, inactive account, or absent password
    // must never mark a mailbox verified.
    const expired = await addAccount("expired");
    const expiredIssue = await issueEmailVerificationForUser(expired.id);
    expectIssued(expiredIssue);
    await pool.query(
      `UPDATE email_verification_tokens
       SET created_at = now() - interval '31 minutes',
           expires_at = now() - interval '1 minute'
       WHERE user_id = $1`,
      [expired.id],
    );
    expectInvalid(await redeemEmailVerificationToken(expiredIssue.token));
    assert.equal(await verifiedAt(expired.id), null);

    const changed = await addAccount("changed-email");
    const changedIssue = await issueEmailVerificationForUser(changed.id);
    expectIssued(changedIssue);
    await pool.query("UPDATE users SET email = $1 WHERE id = $2", [
      `auth01c2b3-changed-${randomUUID()}@example.invalid`, changed.id,
    ]);
    expectInvalid(await redeemEmailVerificationToken(changedIssue.token));
    assert.equal(await verifiedAt(changed.id), null);

    const inactive = await addAccount("inactive");
    const inactiveIssue = await issueEmailVerificationForUser(inactive.id);
    expectIssued(inactiveIssue);
    await pool.query("UPDATE users SET is_active = false WHERE id = $1", [inactive.id]);
    expectInvalid(await redeemEmailVerificationToken(inactiveIssue.token));
    expectUnavailable(await issueEmailVerificationForUser(inactive.id));

    const passwordless = await addAccount("passwordless");
    const passwordlessIssue = await issueEmailVerificationForUser(passwordless.id);
    expectIssued(passwordlessIssue);
    await pool.query("UPDATE users SET password_hash = NULL WHERE id = $1", [passwordless.id]);
    expectInvalid(await redeemEmailVerificationToken(passwordlessIssue.token));
    expectUnavailable(await issueEmailVerificationForUser(passwordless.id));
    console.log("AUTH01C2B3_EXPIRY_ACCOUNT_GATES=PASS");

    // Fault-injection: suppress the user's UPDATE with a fixture-specific
    // BEFORE UPDATE trigger. The service must throw and roll back its earlier
    // token-consumption UPDATE. Drop the trigger before successful redemption.
    const rollback = await addAccount("rollback");
    const rollbackIssue = await issueEmailVerificationForUser(rollback.id);
    expectIssued(rollbackIssue);
    await pool.query(`
      CREATE FUNCTION comic_diary_c2b3_block_verify() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id = ${rollback.id} AND NEW.email_verified_at IS NOT NULL THEN
          RETURN NULL;
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    rollbackFunctionInstalled = true;
    await pool.query(`
      CREATE TRIGGER comic_diary_c2b3_block_verify_trigger
      BEFORE UPDATE OF email_verified_at ON users
      FOR EACH ROW EXECUTE FUNCTION comic_diary_c2b3_block_verify()
    `);
    rollbackTriggerInstalled = true;
    await assert.rejects(
      redeemEmailVerificationToken(rollbackIssue.token),
      /Email-verification account update did not persist/,
    );
    assert.equal(await verifiedAt(rollback.id), null);
    assert.equal((await tokenRows(rollback.id))[0].consumed_at, null);
    await pool.query("DROP TRIGGER comic_diary_c2b3_block_verify_trigger ON users");
    rollbackTriggerInstalled = false;
    await pool.query("DROP FUNCTION comic_diary_c2b3_block_verify()");
    rollbackFunctionInstalled = false;
    assert.deepEqual(await redeemEmailVerificationToken(rollbackIssue.token), { ok: true });
    console.log("AUTH01C2B3_TRANSACTION_ROLLBACK=PASS");

    console.log("AUTH01C2B3_DISPOSABLE_PG_INTEGRATION=PASS");
  } finally {
    try {
      if (rollbackTriggerInstalled) {
        await pool.query("DROP TRIGGER IF EXISTS comic_diary_c2b3_block_verify_trigger ON users");
      }
      if (rollbackFunctionInstalled) {
        await pool.query("DROP FUNCTION IF EXISTS comic_diary_c2b3_block_verify()");
      }
      if (fixtureIds.length > 0) {
        await pool.query("DELETE FROM users WHERE id = ANY($1::int[])", [fixtureIds]);
      }
    } finally {
      await pool.end();
    }
  }
}

main().catch((error: unknown) => {
  // Never print user tokens or database credentials in CI diagnostics.
  console.error("AUTH01C2B3_DISPOSABLE_PG_PROBE_FAILED", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
});
