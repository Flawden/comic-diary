/**
 * Disposable PostgreSQL 17 integration probe for AUTH-01B2.
 * This script refuses anything except the explicitly named CI service DB.
 * It NEVER connects to production, sends email, or exposes reset tokens.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import {
  changeOwnPassword,
} from "../src/modules/auth/password-change-service";
import {
  issuePasswordResetForUser,
  redeemPasswordResetToken,
} from "../src/modules/auth/password-reset-service";
import { hashPassword, verifyPassword } from "../src/modules/auth/password";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url || process.env.GITHUB_ACTIONS !== "true") {
    throw new Error("REFUSED: AUTH-01 probe runs only inside GitHub Actions");
  }
  const target = new URL(url);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "5432" ||
    target.pathname !== "/comic_diary_release" ||
    target.username !== "comic_diary_ci"
  ) {
    throw new Error("REFUSED: not the disposable CI PostgreSQL database");
  }

  const pool = new Pool({ connectionString: url });
  const email = `auth01b2-${randomUUID()}@example.invalid`;
  let userId: number | null = null;

  try {
    const initialPassword = "Safe-Old-Password-123!";
    const initialHash = await hashPassword(initialPassword);
    const created = await pool.query<{ id: number }>(
      "INSERT INTO users (email, password_hash, role, is_active) VALUES ($1, $2, 'USER', true) RETURNING id",
      [email, initialHash],
    );
    userId = created.rows[0].id;

    // New and pre-existing email addresses must never be trusted implicitly.
    const initiallyUnverified = await pool.query<{ email_verified_at: Date | null }>(
      "SELECT email_verified_at FROM users WHERE id = $1", [userId],
    );
    assert.equal(initiallyUnverified.rows[0].email_verified_at, null);
    assert.deepEqual(await issuePasswordResetForUser(userId), {
      ok: false, kind: "account_unavailable",
    });
    const beforeVerified = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM password_reset_tokens WHERE user_id = $1", [userId],
    );
    assert.equal(beforeVerified.rows[0].n, 0);

    // This is ONLY a disposable CI fixture marking the mailbox verified.
    // Production must only set this field after actual mailbox verification.
    await pool.query("UPDATE users SET email_verified_at = now() WHERE id = $1", [userId]);

    const first = await issuePasswordResetForUser(userId);
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error("first token issuance failed");

    const second = await issuePasswordResetForUser(userId);
    assert.equal(second.ok, true);
    if (!second.ok) throw new Error("second token issuance failed");

    const stored = await pool.query<{
      token_hash: string;
      consumed_at: Date | null;
      revoked_at: Date | null;
    }>(
      "SELECT token_hash, consumed_at, revoked_at FROM password_reset_tokens WHERE user_id = $1 ORDER BY id",
      [userId],
    );
    assert.equal(stored.rows.length, 2);
    assert.match(stored.rows[0].token_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(stored.rows[0].token_hash, first.token);
    assert.ok(stored.rows[0].revoked_at !== null);
    assert.equal(stored.rows[1].revoked_at, null);

    assert.deepEqual(
      await redeemPasswordResetToken(first.token, "Strong-Replacement-Password-999!"),
      { ok: false, kind: "invalid_token" },
    );
    assert.deepEqual(
      await redeemPasswordResetToken(second.token, "short"),
      { ok: false, kind: "weak_password" },
    );

    await pool.query(
      "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 day')",
      [userId, "a".repeat(64)],
    );

    // Two real DB transactions race for the same token: exactly one succeeds.
    const concurrent = await Promise.all([
      redeemPasswordResetToken(second.token, "Strong-Replacement-Password-999!"),
      redeemPasswordResetToken(second.token, "Strong-Replacement-Password-999!"),
    ]);
    assert.equal(concurrent.filter((r) => r.ok).length, 1);
    assert.equal(concurrent.filter((r) => !r.ok).length, 1);
    assert.equal(
      (await pool.query("SELECT count(*)::int AS n FROM sessions WHERE user_id = $1", [userId])).rows[0].n,
      0,
    );
    const afterReset = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1", [userId],
    );
    assert.equal(
      await verifyPassword(afterReset.rows[0].password_hash, "Strong-Replacement-Password-999!"),
      true,
    );
    assert.equal(await verifyPassword(afterReset.rows[0].password_hash, initialPassword), false);

    const toExpire = await issuePasswordResetForUser(userId);
    assert.equal(toExpire.ok, true);
    if (!toExpire.ok) throw new Error("expiry test issuance failed");
    await pool.query(
      "UPDATE password_reset_tokens SET created_at = now() - interval '30 minutes', expires_at = now() - interval '1 minute' WHERE user_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL",
      [userId],
    );
    assert.deepEqual(
      await redeemPasswordResetToken(toExpire.token, "New-Again-Password-123!"),
      { ok: false, kind: "invalid_token" },
    );

    const concurrentIssues = await Promise.all([
      issuePasswordResetForUser(userId),
      issuePasswordResetForUser(userId),
    ]);
    assert.equal(concurrentIssues.every((r) => r.ok), true);
    const open = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM password_reset_tokens WHERE user_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL",
      [userId],
    );
    assert.equal(open.rows[0].n, 1);

    // An authenticated password change revokes any outstanding reset link.
    const ownChange = await changeOwnPassword(
      userId,
      "Strong-Replacement-Password-999!",
      "My-New-Secure-Password-999!",
    );
    assert.equal(ownChange.ok, true);
    for (const issued of concurrentIssues) {
      if (!issued.ok) throw new Error("concurrent issuance failed");
      assert.deepEqual(
        await redeemPasswordResetToken(issued.token, "Another-Good-Password-999!"),
        { ok: false, kind: "invalid_token" },
      );
    }

    const toUnverify = await issuePasswordResetForUser(userId);
    assert.equal(toUnverify.ok, true);
    if (!toUnverify.ok) throw new Error("unverification fixture issuance failed");
    await pool.query("UPDATE users SET email_verified_at = NULL WHERE id = $1", [userId]);
    assert.deepEqual(await issuePasswordResetForUser(userId), {
      ok: false, kind: "account_unavailable",
    });
    assert.deepEqual(
      await redeemPasswordResetToken(toUnverify.token, "Another-Good-Password-999!"),
      { ok: false, kind: "invalid_token" },
    );
    // The old token must remain unusable even after verifying again.
    // Wait long enough to make the verification epoch strictly newer than token issuance.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await pool.query("UPDATE users SET email_verified_at = now() WHERE id = $1", [userId]);
    assert.deepEqual(
      await redeemPasswordResetToken(toUnverify.token, "Another-Good-Password-999!"),
      { ok: false, kind: "invalid_token" },
    );
    const toDisable = await issuePasswordResetForUser(userId);
    assert.equal(toDisable.ok, true);
    if (!toDisable.ok) throw new Error("deactivation test issuance failed");
    await pool.query("UPDATE users SET is_active = false WHERE id = $1", [userId]);
    assert.deepEqual(await issuePasswordResetForUser(userId), {
      ok: false, kind: "account_unavailable",
    });
    assert.deepEqual(
      await redeemPasswordResetToken(toDisable.token, "Another-Good-Password-999!"),
      { ok: false, kind: "invalid_token" },
    );

    console.log("AUTH01C2A_MAILBOX_TRUST_GATE=PASS");
    console.log("AUTH01B2_POSTGRESQL_CONCURRENCY=PASS");
    console.log("AUTH01B2_PASSWORD_AND_SESSION_ATOMICITY=PASS");
    console.log("AUTH01B2_EXPIRED_AND_INACTIVE=PASS");
  } finally {
    try {
      await pool.query("DELETE FROM users WHERE email = $1", [email]);
    } finally {
      await pool.end();
    }
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error("AUTH01B2_PROBE_FAILED", error);
    process.exit(1);
  },
);
