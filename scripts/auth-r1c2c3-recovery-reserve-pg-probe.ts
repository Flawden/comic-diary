/**
 * AUTH-01 / R1C2C3: disposable PG17 recovery operator gate + one-shot reservation.
 * The ONLY ON is a direct SQL fixture toggle in disposable GitHub CI, never app/prod.
 * Absolutely no real mail, worker, provider, HTTP, secrets or deploy.
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
  catch { throw new Error("REFUSED: invalid disposable PostgreSQL URL"); }
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
  dispatch_fence_at: Date | null;
  dispatch_reservation_at: Date | null;
  dispatch_reservation_generation: number | null;
  state: string;
}>;

async function main(): Promise<void> {
  const connectionString = requireDisposableCi(); // Refuse before importing the app DB.
  const [issuer, claimer, fencer, reserver] = await Promise.all([
    import("../src/modules/auth/password-reset-request-outbox-issue"),
    import("../src/modules/auth/password-reset-request-outbox-claim"),
    import("../src/modules/auth/password-reset-request-outbox-fence"),
    import("../src/modules/auth/password-reset-request-outbox-reserve"),
  ]);
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000 });
  const email = `auth-r1c2c3-${randomUUID()}@example.invalid`;
  const key = { keyId: "ci_r1c2c3_only", bytes: randomBytes(32) };
  const keys = new Map<string, Uint8Array>([[key.keyId, key.bytes]]);
  const origin = "https://comic-diary.invalid";
  let userId: number | undefined;
  const blocked = { ok: false, kind: "blocked", sendAuthorized: false };
  const reserved = { ok: true, reserved: true, sendAuthorized: false };
  const getLast = async (): Promise<Row> => {
    const rows = await pool.query<Row>(
      `SELECT o.id, o.password_reset_token_id, o.state, o.dispatch_fence_at,
              o.dispatch_reservation_at, o.dispatch_reservation_generation
         FROM password_reset_mail_outbox o
         JOIN password_reset_tokens t ON t.id=o.password_reset_token_id
        WHERE t.user_id=$1 ORDER BY o.id DESC LIMIT 1`, [userId],
    );
    assert.equal(rows.rows.length, 1);
    return rows.rows[0];
  };
  const issue = () => issuer.enqueuePasswordResetMailForUser({ userId: userId!, publicOrigin: origin, key });
  const reserve = (outboxId: number, claimId: string, extra: Record<string, unknown> = {}) =>
    reserver.reservePendingRecoveryDispatchOnce({
      outboxId, claimId, expectedPublicOrigin: origin, keys, ...extra,
    });
  const setGate = async (enabled: boolean, generation: number): Promise<void> => {
    const result = await pool.query(
      `UPDATE password_reset_mail_dispatch_control
          SET enabled=$1,generation=$2,updated_at=now()
        WHERE id=1 RETURNING id`, [enabled,generation],
    );
    assert.equal(result.rowCount, 1);
  };

  try {
    const version = await pool.query<{ major: number }>(
      "SELECT current_setting('server_version_num')::int / 10000 AS major",
    );
    assert.equal(version.rows[0]?.major, 17);
    const controls = await pool.query<{ enabled: boolean; generation: number }>(
      "SELECT enabled,generation FROM password_reset_mail_dispatch_control WHERE id=1",
    );
    assert.deepEqual(controls.rows, [{ enabled: false, generation: 0 }]);
    await assert.rejects(() => pool.query(
      "INSERT INTO password_reset_mail_dispatch_control (id, enabled, generation) VALUES (2,true,1)"),
      (e: unknown) => (e as { code?: string }).code === "23514",
    );
    const cols = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public'
         AND table_name='password_reset_mail_outbox'
         AND column_name IN ('dispatch_reservation_at','dispatch_reservation_generation')`,
    );
    assert.equal(cols.rows.length, 2);

    const fixture = await pool.query<{ id: number }>(
      `INSERT INTO users (email,password_hash,role,is_active,email_verified_at,verification_required_at)
       VALUES ($1,$2,'USER',true,now(),now()) RETURNING id`,
      [email, "ci-not-a-real-password-hash"],
    );
    userId = fixture.rows[0]?.id;
    assert.ok(userId);
    assert.deepEqual(await issue(), { ok: true, queued: true });
    const first = await getLast();
    const claimed = await claimer.claimPendingPasswordResetMailOnce();
    assert.equal(claimed.ok, true);
    if (!claimed.ok) throw new Error("fixture not claimed");
    assert.equal(claimed.outboxId, first.id);
    assert.deepEqual(await fencer.recordPendingRecoveryDispatchFenceOnce({
      outboxId: first.id, claimId: claimed.claimId, expectedPublicOrigin: origin,
      operatorFenceEnabled: true, keys,
    }), { ok: true, fenceRecorded: true, sendAuthorized: false });
    assert.deepEqual(await reserve(first.id, claimed.claimId), blocked, "default OFF");
    assert.equal((await getLast()).dispatch_reservation_at, null);
    await assert.rejects(() => pool.query(
      `UPDATE password_reset_mail_outbox
          SET dispatch_reservation_at=now(),updated_at=now() WHERE id=$1`, [first.id],
    ), (e: unknown) => (e as { code?: string }).code === "23514", "NULL generation invalid");

    // Disposable CI gate fixture ONLY; this probe never calls runtime ON or HTTP.
    await setGate(true,1);
    assert.deepEqual(await reserve(first.id, randomBytes(24).toString("base64url")), blocked);
    assert.deepEqual(await reserve(first.id, claimed.claimId, { keys: new Map() }), blocked);
    assert.deepEqual(await reserve(first.id, claimed.claimId, { expectedPublicOrigin: "https://wrong.invalid" }), blocked);
    assert.equal((await getLast()).dispatch_reservation_at, null);

    const competing = await Promise.all([
      reserve(first.id, claimed.claimId),
      reserve(first.id, claimed.claimId),
    ]);
    assert.equal(competing.filter((r) => r.ok).length, 1);
    assert.ok(competing.some((r) => JSON.stringify(r) === JSON.stringify(reserved)));
    assert.ok(competing.some((r) => JSON.stringify(r) === JSON.stringify(blocked)));
    const after = await getLast();
    assert.ok(after.dispatch_reservation_at instanceof Date);
    assert.equal(after.dispatch_reservation_generation, 1);
    assert.deepEqual(await reserve(first.id, claimed.claimId), blocked, "one-shot");

    // A later OFF is durable but cannot retroactively delete an earlier reservation.
    await setGate(false,2);
    assert.ok((await getLast()).dispatch_reservation_at);
    const unstarted = await getLast();
    for (const result of ["accepted", "rejected", "uncertain"]) {
      assert.equal(Reflect.get(claimer, "finalizeClaimedPasswordResetMail"), undefined);
      assert.throws(() => Reflect.apply(Reflect.get(claimer, "finalizeClaimedPasswordResetMail"), undefined,
        [{ outboxId: first.id, claimId: claimed.claimId, result }]), TypeError);
      assert.deepEqual(await getLast(), unstarted);
    }
    assert.equal((await getLast()).state, "in_flight");
    assert.deepEqual(await reserve(first.id, claimed.claimId), blocked);

    assert.deepEqual(await issue(), { ok: true, queued: true });
    const next = await getLast();
    const nextClaim = await claimer.claimPendingPasswordResetMailOnce();
    assert.equal(nextClaim.ok,true);
    if (!nextClaim.ok) throw new Error("second fixture not claimed");
    assert.deepEqual(await fencer.recordPendingRecoveryDispatchFenceOnce({
      outboxId: next.id, claimId: nextClaim.claimId, expectedPublicOrigin: origin,
      operatorFenceEnabled: true, keys,
    }), { ok: true, fenceRecorded: true, sendAuthorized: false });
    assert.deepEqual(await reserve(next.id, nextClaim.claimId), blocked, "OFF blocks new reservations");
    assert.equal((await getLast()).dispatch_reservation_at, null);
    console.log("AUTH01_R1C2C3_DISPOSABLE_PG17=PASS; DEFAULT_OFF_ONE_WINNER_LOCK_ORDER_NO_SEND");
  } finally {
    try {
      // CI-only cleanup. Restore default-OFF even if assertions throw.
      await setGate(false,0);
      if (userId) await pool.query("DELETE FROM users WHERE id=$1 AND email=$2", [userId,email]);
    } finally { key.bytes.fill(0); await pool.end(); }
  }
}
main().catch((e: unknown) => {
  console.error("AUTH01_R1C2C3_DISPOSABLE_PG17=FAIL", e instanceof Error ? e.message : "unknown error");
  process.exitCode=1;
});
