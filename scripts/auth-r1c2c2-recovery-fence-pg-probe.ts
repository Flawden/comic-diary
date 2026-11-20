/**
 * AUTH-01 / R1C2C2: disposable PG17 recovery fence concurrency probe.
 * No mail, provider, worker, scheduler, prod access, operator enable or network IO.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

function requireDisposableCi(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw || process.env.GITHUB_ACTIONS !== "true" ||
      process.env.GITHUB_REPOSITORY !== "Flawden/comic-diary" ||
      process.env.GITHUB_WORKFLOW !== "CI") {
    throw new Error("REFUSED: exact disposable GitHub CI PostgreSQL only");
  }
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error("REFUSED: invalid disposable database URL"); }
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
      url.port !== "5432" || url.pathname !== "/comic_diary_release" ||
      url.username !== "comic_diary_ci" || url.password !== "ci_ephemeral_password" ||
      url.search !== "" || url.hash !== "") {
    throw new Error("REFUSED: database is not the approved disposable PG17 CI target");
  }
  return raw;
}

type Row = Readonly<{
  id: number;
  password_reset_token_id: number;
  state: string;
  dispatch_fence_at: Date | null;
}>;

async function main(): Promise<void> {
  // Refuse other targets BEFORE importing anything that can access the app DB.
  const connectionString = requireDisposableCi();
  const [issuer, claimer, fencer] = await Promise.all([
    import("../src/modules/auth/password-reset-request-outbox-issue"),
    import("../src/modules/auth/password-reset-request-outbox-claim"),
    import("../src/modules/auth/password-reset-request-outbox-fence"),
  ]);
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000 });
  const email = `auth-r1c2c2-${randomUUID()}@example.invalid`;
  const key = { keyId: "ci_r1c2c2_only", bytes: randomBytes(32) };
  const keyring = new Map<string, Uint8Array>([[key.keyId, key.bytes]]);
  const publicOrigin = "https://comic-diary.invalid";
  let userId: number | undefined;
  const blocked = { ok: false, kind: "blocked", sendAuthorized: false };
  const recorded = { ok: true, fenceRecorded: true, sendAuthorized: false };
  const issue = () => issuer.enqueuePasswordResetMailForUser({
    userId: userId!, publicOrigin, key,
  });
  const rows = async () => (await pool.query<Row>(
    `SELECT o.id, o.password_reset_token_id, o.state, o.dispatch_fence_at
       FROM password_reset_mail_outbox o
       JOIN password_reset_tokens t ON t.id=o.password_reset_token_id
      WHERE t.user_id=$1 ORDER BY o.id`, [userId],
  )).rows;
  const last = async () => (await rows()).at(-1)!;
  const fence = (outboxId: number, claimId: string, overrides: Record<string, unknown> = {}) =>
    fencer.recordPendingRecoveryDispatchFenceOnce({
      outboxId, claimId, expectedPublicOrigin: publicOrigin,
      operatorFenceEnabled: true, keys: keyring, ...overrides,
    });

  try {
    const server = await pool.query<{ major: number }>(
      "SELECT current_setting('server_version_num')::int / 10000 AS major",
    );
    assert.equal(server.rows[0]?.major, 17);
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='password_reset_mail_outbox'
        AND column_name='dispatch_fence_at'`,
    );
    assert.deepEqual(columns.rows, [{ column_name: "dispatch_fence_at" }]);
    const checks = await pool.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conname='password_reset_mail_outbox_dispatch_fence_check'`,
    );
    assert.equal(checks.rows.length, 1);

    const fixture = await pool.query<{ id: number }>(
      `INSERT INTO users (email,password_hash,role,is_active,email_verified_at,verification_required_at)
       VALUES ($1,$2,'USER',true,now(),now()) RETURNING id`,
      [email, "ci-not-a-real-password-hash"],
    );
    userId = fixture.rows[0]?.id;
    assert.ok(userId);

    assert.deepEqual(await issue(), { ok: true, queued: true });
    const ready = await last();
    assert.equal(ready.state, "ready");
    await assert.rejects(
      () => pool.query("UPDATE password_reset_mail_outbox SET dispatch_fence_at=now() WHERE id=$1", [ready.id]),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, "23514");
        return true;
      },
      "SQL CHECK must reject a READY row with a premature fence",
    );
    assert.equal((await last()).dispatch_fence_at, null);

    const claimed = await claimer.claimPendingPasswordResetMailOnce();
    assert.equal(claimed.ok, true);
    if (!claimed.ok) throw new Error("fixture was not claimed");
    assert.equal(claimed.outboxId, ready.id);
    assert.deepEqual(await fence(ready.id, claimed.claimId, { operatorFenceEnabled: false }), blocked);
    assert.deepEqual(await fence(ready.id, randomBytes(24).toString("base64url")), blocked);
    assert.deepEqual(await fence(ready.id, claimed.claimId, { keys: new Map() }), blocked);
    assert.deepEqual(await fence(ready.id, claimed.claimId, { expectedPublicOrigin: "https://wrong.invalid" }), blocked);
    assert.equal((await last()).dispatch_fence_at, null);

    // Both handlers see the same claim, but at most one commits a fence.
    const competing = await Promise.all([
      fence(ready.id, claimed.claimId),
      fence(ready.id, claimed.claimId),
    ]);
    assert.equal(competing.filter((r) => r.ok).length, 1);
    assert.equal(competing.filter((r) => !r.ok).length, 1);
    assert.ok(competing.some((r) => JSON.stringify(r) === JSON.stringify(recorded)));
    assert.ok(competing.some((r) => JSON.stringify(r) === JSON.stringify(blocked)));
    assert.ok((await last()).dispatch_fence_at instanceof Date);
    assert.deepEqual(await fence(ready.id, claimed.claimId), blocked);
    assert.deepEqual(await claimer.claimPendingPasswordResetMailOnce(), { ok: false, kind: "no_work" });

    // A fence does not grant settlement authority. The removed legacy API
    // cannot finalize any classification and must leave the fenced row intact.
    const fenced = await last();
    for (const result of ["accepted", "rejected", "uncertain"]) {
      assert.equal(Reflect.get(claimer, "finalizeClaimedPasswordResetMail"), undefined);
      assert.throws(() => Reflect.apply(Reflect.get(claimer, "finalizeClaimedPasswordResetMail"), undefined,
        [{ outboxId: ready.id, claimId: claimed.claimId, result }]), TypeError);
      assert.deepEqual(await last(), fenced);
    }
    assert.equal((await last()).state, "in_flight");
    assert.ok((await last()).dispatch_fence_at);
    assert.deepEqual(await fence(ready.id, claimed.claimId), blocked);

    // Revoked before locking blocks a *new* marker, while an old fence persists.
    assert.deepEqual(await issue(), { ok: true, queued: true });
    const later = await claimer.claimPendingPasswordResetMailOnce();
    assert.equal(later.ok, true);
    if (!later.ok) throw new Error("second fixture was not claimed");
    await pool.query("UPDATE password_reset_tokens SET revoked_at=now() WHERE id=$1",
      [(await last()).password_reset_token_id]);
    assert.deepEqual(await fence(later.outboxId, later.claimId), blocked);
    assert.equal((await last()).dispatch_fence_at, null);

    console.log("AUTH01_R1C2C2_DISPOSABLE_PG17=PASS; EXACTLY_ONE_FENCE_REVOKE_FAIL_CLOSED_NO_SEND");
  } finally {
    try {
      if (userId) await pool.query("DELETE FROM users WHERE id=$1 AND email=$2", [userId, email]);
    } finally {
      key.bytes.fill(0);
      await pool.end();
    }
  }
}

main().catch((error: unknown) => {
  console.error("AUTH01_R1C2C2_DISPOSABLE_PG17=FAIL", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
