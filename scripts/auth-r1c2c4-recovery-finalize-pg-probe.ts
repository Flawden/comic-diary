/**
 * AUTH-01 R1C2C4: ONLY disposable PostgreSQL 17 GitHub CI.
 * Simulates synthetic provider classifications; NEVER sends actual mail.
 * Tests once-only outcome persistence after a durable operator reservation.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

function disposableCiUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw || process.env.GITHUB_ACTIONS !== "true" ||
      process.env.GITHUB_REPOSITORY !== "Flawden/comic-diary" ||
      process.env.GITHUB_WORKFLOW !== "CI") {
    throw Error("REFUSED: only exact disposable GitHub CI PostgreSQL");
  }
  let url: URL;
  try { url = new URL(raw); }
  catch { throw Error("REFUSED: malformed DB URL"); }
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
      url.port !== "5432" || url.pathname !== "/comic_diary_release" ||
      url.username !== "comic_diary_ci" || url.password !== "ci_ephemeral_password" ||
      url.search !== "" || url.hash !== "") {
    throw Error("REFUSED: unapproved database target");
  }
  return raw;
}

type Row = Readonly<{
  id: number;
  state: string;
  finalized_at: Date | null;
  dispatch_reservation_generation: number | null;
  dispatch_reservation_at: Date | null;
  attempt_count: number;
}>;

async function main(): Promise<void> {
  const connectionString = disposableCiUrl(); // Must reject before loading app DB.
  const [issuer, claimer, fencer, reserver, finalizer] = await Promise.all([
    import("../src/modules/auth/password-reset-request-outbox-issue"),
    import("../src/modules/auth/password-reset-request-outbox-claim"),
    import("../src/modules/auth/password-reset-request-outbox-fence"),
    import("../src/modules/auth/password-reset-request-outbox-reserve"),
    import("../src/modules/auth/password-reset-request-outbox-finalize-reserved"),
  ]);
  const pool = new Pool({ connectionString, max: 6, connectionTimeoutMillis: 5000 });
  const origin = "https://comic-diary.invalid";
  const key = { keyId: "ci_r1c2c4_only", bytes: randomBytes(32) };
  const keys = new Map<string, Uint8Array>([[key.keyId, key.bytes]]);
  const users: Array<{ id: number; email: string }> = [];
  const blocked = { ok: false, kind: "blocked", sendAuthorized: false, retryAuthorized: false };
  const setGate = async (enabled: boolean, generation: number): Promise<void> => {
    const res = await pool.query(
      `UPDATE password_reset_mail_dispatch_control
          SET enabled=$1,generation=$2,updated_at=now() WHERE id=1 RETURNING id`,
      [enabled, generation],
    );
    assert.equal(res.rowCount, 1);
  };
  const state = async (id: number): Promise<Row> => {
    const res = await pool.query<Row>(
      `SELECT id,state,finalized_at,dispatch_reservation_at,
              dispatch_reservation_generation,attempt_count
         FROM password_reset_mail_outbox WHERE id=$1`, [id],
    );
    assert.equal(res.rows.length, 1);
    return res.rows[0]!;
  };
  const fixture = async () => {
    const email = `auth-r1c2c4-${randomUUID()}@example.invalid`;
    const user = await pool.query<{ id: number }>(
      `INSERT INTO users (email,password_hash,role,is_active,email_verified_at,verification_required_at)
       VALUES ($1,$2,'USER',true,now(),now()) RETURNING id`,
      [email, "ci-only-not-a-real-hash"],
    );
    const userId = user.rows[0]!.id;
    users.push({ id: userId, email });
    assert.deepEqual(await issuer.enqueuePasswordResetMailForUser({
      userId, publicOrigin: origin, key,
    }), { ok: true, queued: true });
    const item = await pool.query<{ id: number }>(
      `SELECT o.id FROM password_reset_mail_outbox o
       JOIN password_reset_tokens t ON t.id=o.password_reset_token_id
       WHERE t.user_id=$1 ORDER BY o.id DESC LIMIT 1`, [userId],
    );
    const outboxId = item.rows[0]!.id;
    const claim = await claimer.claimPendingPasswordResetMailOnce();
    assert.equal(claim.ok, true);
    if (!claim.ok) throw Error("fixture could not claim");
    assert.equal(claim.outboxId, outboxId);
    assert.deepEqual(await fencer.recordPendingRecoveryDispatchFenceOnce({
      outboxId, claimId: claim.claimId, expectedPublicOrigin: origin,
      operatorFenceEnabled: true, keys,
    }), { ok: true, fenceRecorded: true, sendAuthorized: false });
    return { outboxId, claimId: claim.claimId };
  };
  const reserve = (f: { outboxId: number; claimId: string }) =>
    reserver.reservePendingRecoveryDispatchOnce({
      outboxId: f.outboxId, claimId: f.claimId, expectedPublicOrigin: origin, keys,
    });
  const finish = (f: { outboxId: number; claimId: string },
                  evidence: unknown, generation: number = 1) =>
    finalizer.finalizeReservedRecoveryProviderOutcomeOnce({
      ...f, reservationGeneration: generation, evidence,
    });
  try {
    const version = await pool.query<{ major: number }>(
      "SELECT current_setting('server_version_num')::int / 10000 AS major",
    );
    assert.equal(version.rows[0]!.major, 17);
    assert.deepEqual((await pool.query(
      "SELECT enabled,generation FROM password_reset_mail_dispatch_control WHERE id=1",
    )).rows, [{ enabled: false, generation: 0 }]);

    const first = await fixture();
    assert.deepEqual(await finish(first, { kind: "provider_accepted", acknowledged: true }), blocked,
      "unreserved outcome must be blocked");
    await setGate(true, 1); // CI-only SQL, never app runtime.
    assert.deepEqual(await reserve(first), { ok: true, reserved: true, sendAuthorized: false });
    assert.deepEqual(await finish(first, { kind: "provider_accepted", acknowledged: true }, 2), blocked,
      "wrong reservation generation must block");
    assert.deepEqual(await finish({ ...first, claimId: randomBytes(24).toString("base64url") },
      { kind: "provider_accepted", acknowledged: true }), blocked,
      "wrong claim must block");
    assert.equal((await state(first.outboxId)).state, "in_flight");

    // OFF after reservation must not make durable historical outcome unrecordable.
    await setGate(false, 2);
    const competing = await Promise.all([
      finish(first, { kind: "provider_accepted", acknowledged: true }),
      finish(first, { kind: "provider_rejected", definitivelyNotAccepted: true }),
    ]);
    assert.equal(competing.filter((r) => r.ok).length, 1, "exactly one terminal write");
    const winner = competing.find((r) => r.ok);
    assert.ok(winner && winner.ok);
    assert.equal(winner.retryAuthorized, false);
    const firstState = await state(first.outboxId);
    assert.equal(firstState.state, winner.classification);
    assert.ok(firstState.finalized_at instanceof Date);
    assert.equal(firstState.attempt_count, 1);
    assert.equal(firstState.dispatch_reservation_generation, 1);
    assert.ok(firstState.dispatch_reservation_at instanceof Date);
    assert.deepEqual(await finish(first, { kind: "transport_uncertain" }), blocked,
      "duplicate finalization is forbidden");

    await setGate(true, 3);
    const second = await fixture();
    assert.deepEqual(await reserve(second), { ok: true, reserved: true, sendAuthorized: false });
    const ambiguous = await finalizer.finalizeReservedRecoveryProviderOutcomeOnce({
      ...second, reservationGeneration: 3, evidence: { kind: "transport_uncertain" },
    });
    assert.deepEqual(ambiguous, { ok: true, recorded: true, classification: "uncertain",
      sendAuthorized: false, retryAuthorized: false });
    assert.equal((await state(second.outboxId)).state, "uncertain");
    assert.deepEqual(await reserve(second), { ok: false, kind: "blocked", sendAuthorized: false });
    assert.deepEqual(await finalizer.finalizeReservedRecoveryProviderOutcomeOnce({
      ...second, reservationGeneration: 3, evidence: null,
    }), blocked);

    const third = await fixture();
    assert.deepEqual(await reserve(third), { ok: true, reserved: true, sendAuthorized: false });
    const rejected = await finalizer.finalizeReservedRecoveryProviderOutcomeOnce({
      ...third, reservationGeneration: 3,
      evidence: { kind: "provider_rejected", definitivelyNotAccepted: true },
    });
    assert.deepEqual(rejected, { ok: true, recorded: true, classification: "rejected",
      sendAuthorized: false, retryAuthorized: false });
    assert.equal((await state(third.outboxId)).state, "rejected");
    console.log("AUTH01_R1C2C4_DISPOSABLE_PG17=PASS; RESERVED_ONCE_TERMINAL_ONE_WINNER_NO_SEND");
  } finally {
    try {
      await setGate(false, 0); // Revert CI-only fixture OFF even after a test failure.
      for (const u of users) {
        await pool.query("DELETE FROM users WHERE id=$1 AND email=$2", [u.id, u.email]);
      }
    } finally { key.bytes.fill(0); await pool.end(); }
  }
}
main().catch((error: unknown) => {
  console.error("AUTH01_R1C2C4_DISPOSABLE_PG17=FAIL",
    error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
