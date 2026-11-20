/** Real disposable PostgreSQL + mock HTTP. Never loads a local .env file. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";

function disposableUrl(): string {
  const value = process.env.AUTH01_DISPATCH_TEST_DATABASE_URL;
  if (!value) throw new Error("Set AUTH01_DISPATCH_TEST_DATABASE_URL to the disposable test database");
  const url = new URL(value);
  const local = url.hostname === "127.0.0.1" && url.port === "55491" && url.username === "auth01_qa" && url.pathname === "/auth01_nightshift";
  const ci = process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_REPOSITORY === "Flawden/comic-diary" &&
    url.hostname === "127.0.0.1" && url.port === "5432" && url.username === "comic_diary_ci" && url.pathname === "/comic_diary_release";
  if (url.protocol !== "postgresql:" || (!local && !ci) || url.search || url.hash) throw new Error("REFUSED: database is not an allowed disposable target");
  return value;
}
const connectionString = disposableUrl();
Object.assign(process.env, { DATABASE_URL: connectionString, NODE_ENV: "test" });
const pool = new Pool({ connectionString });
let dispatch: typeof import("../src/modules/auth/password-reset-dispatch");
let issuer: typeof import("../src/modules/auth/password-reset-request-outbox-issue");
let requests: typeof import("../src/app/api/auth/password-reset/request/route");
let redemption: typeof import("../src/app/api/auth/password-reset/redeem/route");
let crypto: typeof import("../src/modules/auth/password-reset-request-outbox-crypto");
let password: typeof import("../src/modules/auth/password");
let NextRequest: typeof import("next/server").NextRequest;
let env: Record<string, string>;
let userId: number;
let email: string;
let originalHash: string;
let calls: number;
let sentBody: { from: string; to: string[]; subject: string; text: string } | undefined;
let sentKey: string | null;
let comicId: number | undefined;
const origin = "https://reader.example.invalid";
const key = { keyId: "nightshift", bytes: randomBytes(32) };
const nativeFetch = globalThis.fetch;
const accepted = () => new Response(JSON.stringify({ id: "22222222-aaaa-4444-8888-cccccccccccc" }), { status: 201 });
const mockHttp = async (url: string, init: RequestInit) => {
  calls++;
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(init.method, "POST"); assert.equal(init.redirect, "error");
  assert.ok(init.signal instanceof AbortSignal);
  sentBody = JSON.parse(String(init.body));
  sentKey = new Headers(init.headers).get("Idempotency-Key");
  return accepted();
};
const run = (http = mockHttp, hooks?: Parameters<typeof dispatch.dispatchPasswordResetMailForTest>[0]["hooks"]) =>
  dispatch.dispatchPasswordResetMailForTest({ env, http, hooks });
const queue = () => issuer.enqueuePasswordResetMailForUser({ userId, publicOrigin: origin, key });
const item = async () => (await pool.query("SELECT o.* FROM password_reset_mail_outbox o JOIN password_reset_tokens t ON t.id=o.password_reset_token_id WHERE t.user_id=$1 ORDER BY o.id DESC LIMIT 1", [userId])).rows[0];
const request = (body: unknown, ip = "192.0.2.1") => new NextRequest(origin + "/api/auth/password-reset/request", {
  method: "POST", headers: { host: "reader.example.invalid", origin, "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify(body),
});

before(async () => {
  // Every unmocked outbound request is a test failure, never a live Resend call.
  globalThis.fetch = async () => { throw new Error("UNMOCKED NETWORK FORBIDDEN"); };
  dispatch = await import("../src/modules/auth/password-reset-dispatch");
  issuer = await import("../src/modules/auth/password-reset-request-outbox-issue");
  requests = await import("../src/app/api/auth/password-reset/request/route");
  redemption = await import("../src/app/api/auth/password-reset/redeem/route");
  crypto = await import("../src/modules/auth/password-reset-request-outbox-crypto");
  password = await import("../src/modules/auth/password");
  ({ NextRequest } = await import("next/server"));
  originalHash = await password.hashPassword("Original-Password-123!");
});
beforeEach(async () => {
  calls = 0; sentBody = undefined; sentKey = null; comicId = undefined;
  env = { AUTH_RECOVERY_DISPATCH_ENABLED: "true", AUTH_RECOVERY_SENDER_VERIFIED: "true",
    AUTH_RECOVERY_RESEND_CONFIG_READY: "true", AUTH_RECOVERY_WORKER_ENABLED: "true",
    AUTH_RECOVERY_FROM_ADDRESS: "no-reply@example.invalid", AUTH_RECOVERY_SENDER_DOMAIN: "example.invalid",
    AUTH_RECOVERY_PUBLIC_ORIGIN: origin, COMIC_DIARY_PUBLIC_ORIGIN: origin, RESEND_API_KEY: "re_SYNTHETIC_NO_REAL_CREDENTIAL",
    PASSWORD_RESET_OUTBOX_KEY_ID: key.keyId, PASSWORD_RESET_OUTBOX_KEY_BASE64: key.bytes.toString("base64"),
    PASSWORD_RESET_REQUEST_ENABLED: "true", PASSWORD_RESET_REQUEST_MAIL_READY: "true", PASSWORD_RESET_REDEEM_ENABLED: "true" };
  Object.assign(process.env, env);
  email = `nightshift-${randomUUID()}@example.invalid`;
  userId = (await pool.query("INSERT INTO users(email,password_hash,is_active,email_verified_at,verification_required_at) VALUES($1,$2,true,now()-interval '1 minute',NULL) RETURNING id", [email, originalHash])).rows[0].id;
  await pool.query("UPDATE password_reset_mail_dispatch_control SET enabled=true,generation=1 WHERE id=1");
  // Test-only rate-limit buckets, no production state exists in this database.
  await pool.query("DELETE FROM auth_rate_limits WHERE scope LIKE 'password-reset-%'");
});
afterEach(async () => {
  await pool.query("DELETE FROM users WHERE id=$1", [userId]);
  if (comicId) await pool.query("DELETE FROM comics WHERE id=$1", [comicId]);
  await pool.query("UPDATE password_reset_mail_dispatch_control SET enabled=false,generation=0 WHERE id=1");
});
after(async () => {
  globalThis.fetch = nativeFetch;
  await pool.end();
  const { db } = await import("../src/db");
  await db.$client.end();
  key.bytes.fill(0);
});

// Controlled six-minute fixture age, preserving token TTL, AEAD binding and DB CHECKs.
// Only runs against disposableUrl(); no real clock delay or production time seam.
async function ageClaimFixture() {
  const row = await item();
  const binding = { passwordResetTokenId: row.password_reset_token_id, idempotencyKey: row.idempotency_key, expiresAt: row.expires_at };
  const input = crypto.unsealPasswordResetMailOutboxPayload({ payloadCiphertext: row.payload_ciphertext,
    payloadNonce: row.payload_nonce, payloadKeyId: row.payload_key_id, payloadDigest: row.payload_digest }, binding, new Map([[key.keyId, key.bytes]]));
  assert.ok(input);
  const expiresAt = new Date(row.expires_at.getTime() - 360_000);
  const sealed = crypto.sealPasswordResetMailOutboxPayload({ ...input, expiresAt }, { ...binding, expiresAt }, key);
  assert.ok(sealed);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE users SET email_verified_at=email_verified_at-interval '6 minutes' WHERE id=$1", [userId]);
    await client.query("UPDATE password_reset_tokens SET created_at=created_at-interval '6 minutes',expires_at=$2 WHERE id=$1", [row.password_reset_token_id, expiresAt]);
    await client.query(`UPDATE password_reset_mail_outbox SET created_at=created_at-interval '6 minutes',
      claimed_at=claimed_at-interval '6 minutes', dispatch_fence_at=dispatch_fence_at-interval '6 minutes',
      dispatch_reservation_at=dispatch_reservation_at-interval '6 minutes',expires_at=$2,
      payload_ciphertext=$3,payload_nonce=$4,payload_digest=$5 WHERE id=$1`,
    [row.id, expiresAt, sealed.payloadCiphertext, sealed.payloadNonce, sealed.payloadDigest]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

for (const classification of ["accepted", "rejected", "uncertain"] as const) {
  test(`Round 2.3 A/G: old claim, fresh committed start survives recovery and settles ${classification} once`, async () => {
    await queue();
    const http = async (url: string, init: RequestInit) => {
      await mockHttp(url, init);
      return classification === "accepted" ? accepted() : new Response(null, { status: classification === "rejected" ? 422 : 503 });
    };
    let recovered: number | undefined;
    let started = false;
    const result = await run(http, { afterClaim: ageClaimFixture, afterStart: async () => {
      const before = await item();
      assert.ok(before.dispatch_started_at instanceof Date);
      assert.ok(before.claimed_at.getTime() < Date.now() - 300_000);
      started = true;
      recovered = await dispatch.recoverAbandonedPasswordResetDispatches();
      assert.equal(calls, 0);
    } });
    assert.equal(started, true, "start committed before recovery");
    assert.equal(recovered, 0, `fresh start terminalized: result=${JSON.stringify(result)}, HTTP calls=${calls}`);
    assert.deepEqual(result, { status: "recorded", attempted: true, classification });
    const terminal = await item(); assert.equal(terminal.state, classification);
    assert.equal(await dispatch.recoverAbandonedPasswordResetDispatches(), 0);
    await run(); assert.deepEqual(await item(), terminal); assert.equal(calls, 1);
  });
}

function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

// Observe actual PostgreSQL lock waits, rather than guessing transaction order by sleeping.
async function waitBlocked(blocker: number, pattern: string): Promise<number> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await pool.query("SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE $2", [blocker, pattern]);
    if (result.rows.length) return result.rows[0].pid;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Expected independent PostgreSQL lock wait did not occur");
}

for (const first of ["start", "recovery"] as const) {
  test(`Round 2.3 D: concurrent start/recovery, ${first} locks CONTROL first`, async () => {
    await queue();
    const reserved = latch(), begin = latch(), http = latch();
    const locker = await pool.connect();
    let locked = false;
    let recovery: Promise<number> | undefined;
    const worker = run(mockHttp, { afterClaim: ageClaimFixture, afterReservation: async () => {
      await locker.query("BEGIN"); locked = true;
      await locker.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
      reserved.release(); await begin.promise;
    }, afterStart: () => http.promise });
    try {
      await reserved.promise;
      const pid = (await locker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      if (first === "start") {
        begin.release();
        const startPid = await waitBlocked(pid, '%"users"%');
        recovery = dispatch.recoverAbandonedPasswordResetDispatches();
        await waitBlocked(startPid, '%password_reset_mail_dispatch_control%');
      } else {
        recovery = dispatch.recoverAbandonedPasswordResetDispatches();
        const recoveryPid = await waitBlocked(pid, '%"users"%');
        begin.release();
        await waitBlocked(recoveryPid, '%password_reset_mail_dispatch_control%');
      }
      assert.equal(calls, 0);
      await locker.query("COMMIT"); locked = false;
      const recovered = await recovery;
      const snapshot = await item();
      http.release();
      const result = await worker;
      assert.equal(recovered, first === "start" ? 0 : 1);
      assert.equal(snapshot.state, first === "start" ? "in_flight" : "uncertain");
      assert.equal(snapshot.dispatch_started_at !== null, first === "start");
      assert.deepEqual(result, first === "start" ? { status: "recorded", attempted: true, classification: "accepted" } : { status: "blocked", attempted: false });
      const terminal = await item();
      assert.equal(await dispatch.recoverAbandonedPasswordResetDispatches(), 0);
      await run(); assert.deepEqual(await item(), terminal);
      assert.equal(calls, first === "start" ? 1 : 0);
    } finally {
      begin.release(); http.release();
      if (locked) await locker.query("ROLLBACK");
      locker.release();
      await Promise.allSettled([worker, ...(recovery ? [recovery] : [])]);
    }
  });
}

for (const started of [false, true]) {
  test(`Round 2.3 B/C/F: abandoned ${started ? "old start" : "claim without start"} terminalizes once without HTTP or requeue`, async () => {
    await queue();
    let recovered: number | undefined;
    let terminal: Awaited<ReturnType<typeof item>>;
    let repeat: number | undefined;
    let repeatedSnapshot: Awaited<ReturnType<typeof item>>;
    const recover = async () => {
      if (started) await pool.query("UPDATE password_reset_mail_outbox SET dispatch_fence_at=claimed_at,dispatch_reservation_at=claimed_at,dispatch_started_at=claimed_at WHERE id=$1", [(await item()).id]);
      recovered = await dispatch.recoverAbandonedPasswordResetDispatches();
      terminal = await item();
      repeat = await dispatch.recoverAbandonedPasswordResetDispatches();
      repeatedSnapshot = await item();
      // Simulate the original process disappearing before it can call transport.
      throw new Error("synthetic crash after abandoned recovery");
    };
    const result = await run(mockHttp, { afterClaim: ageClaimFixture, ...(started ? { afterStart: recover } : { afterReservation: recover }) });
    assert.equal(recovered, 1); assert.equal(result.attempted, false);
    assert.equal(terminal.state, "uncertain"); assert.equal(terminal.attempt_count, 1);
    assert.equal(repeat, 0); assert.deepEqual(repeatedSnapshot, terminal);
    await run(); assert.equal(calls, 0); assert.equal((await item()).state, "uncertain");
  });
}

test("Round 2.3 E: fresh start survives recovery and can settle after OFF, new starts stay blocked", async () => {
  await queue();
  let recovered: number | undefined;
  const result = await run(mockHttp, { afterClaim: ageClaimFixture, afterStart: async () => {
    await pool.query("UPDATE password_reset_mail_dispatch_control SET enabled=false,generation=generation+1 WHERE id=1");
    recovered = await dispatch.recoverAbandonedPasswordResetDispatches();
  } });
  assert.equal(recovered, 0);
  assert.deepEqual(result, { status: "recorded", attempted: true, classification: "accepted" });
  await queue();
  assert.deepEqual(await run(), { status: "blocked", attempted: false });
  assert.equal((await item()).state, "ready"); assert.equal(calls, 1);
});

test("all readiness flags and required secrets fail closed before claiming", async () => {
  await queue();
  for (const field of ["AUTH_RECOVERY_DISPATCH_ENABLED", "AUTH_RECOVERY_SENDER_VERIFIED", "AUTH_RECOVERY_RESEND_CONFIG_READY", "RESEND_API_KEY", "PASSWORD_RESET_OUTBOX_KEY_BASE64", "PASSWORD_RESET_REDEEM_ENABLED"]) {
    const missing = { ...env }; delete missing[field];
    assert.deepEqual(await dispatch.dispatchPasswordResetMailForTest({ env: missing, http: mockHttp }), { status: "disabled", attempted: false });
  }
  assert.equal(calls, 0); assert.equal((await item()).state, "ready");
});
test("forged authorization and caller payload cannot reach HTTP", async () => {
  await queue();
  assert.deepEqual(await dispatch.dispatchNextPasswordResetMail({ authorization: { kind: "durably_authorized_recovery_dispatch" } }), { status: "blocked", attempted: false });
  assert.deepEqual(await dispatch.dispatchPasswordResetMailForTest({ env, http: mockHttp, request: { toJSON() { throw Error("must not evaluate"); } } } as never), { status: "blocked", attempted: false });
  assert.equal(calls, 0); assert.equal((await item()).state, "ready");
});
test("test HTTP seam cannot be used in production mode", async () => {
  await queue(); Object.assign(process.env, { NODE_ENV: "production" });
  try { assert.equal((await run()).status, "blocked"); assert.equal(calls, 0); }
  finally { Object.assign(process.env, { NODE_ENV: "test" }); }
});
test("persisted OFF gate blocks even with all runtime flags ON", async () => {
  await queue(); await pool.query("UPDATE password_reset_mail_dispatch_control SET enabled=false WHERE id=1");
  assert.equal((await run()).status, "blocked"); assert.equal(calls, 0); assert.equal((await item()).state, "ready");
});
test("public requests with runtime readiness ON and DB gate OFF are acknowledged and queued, not sent", async () => {
  await pool.query("UPDATE password_reset_mail_dispatch_control SET enabled=false WHERE id=1");
  const response = await requests.POST(request({ email }));
  assert.equal(response.status, 202); assert.equal((await item()).state, "ready");
  assert.equal((await run()).status, "blocked"); assert.equal(calls, 0);
});
test("redemption OFF disables dispatch, preserves READY and refuses operator ON", async () => {
  await queue();
  for (const value of ["false", "TRUE", "true ", ""]) {
    env.PASSWORD_RESET_REDEEM_ENABLED = value;
    const result = await run();
    assert.deepEqual(result, { status: "disabled", attempted: false });
    assert.equal((await item()).state, "ready"); assert.equal(calls, 0);
  }
  await pool.query("UPDATE password_reset_mail_dispatch_control SET enabled=false,generation=2 WHERE id=1");
  const execute = promisify(execFile);
  await assert.rejects(execute(process.execPath, ["scripts/auth-recovery-control.mjs", "on", "2"], {
    cwd: process.cwd(), env: { ...process.env, ...env, DATABASE_URL: connectionString, PASSWORD_RESET_REDEEM_ENABLED: "false" },
  }));
  assert.deepEqual((await pool.query("SELECT enabled,generation FROM password_reset_mail_dispatch_control WHERE id=1")).rows, [{ enabled: false, generation: 2 }]);
  assert.equal((await item()).state, "ready"); assert.equal(calls, 0);
});
test("operator CLI requires explicit generation and configuration; transitions never send HTTP", async () => {
  const execute = promisify(execFile);
  const control = (...args: string[]) => execute(process.execPath, ["scripts/auth-recovery-control.mjs", ...args], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: connectionString },
  });
  assert.deepEqual(JSON.parse((await control("status")).stdout), { enabled: true, generation: 1 });
  assert.deepEqual(JSON.parse((await control("off", "1")).stdout), { enabled: false, generation: 2 });
  await assert.rejects(control("on", "1"));
  process.env.AUTH_RECOVERY_DISPATCH_ENABLED = "false";
  await assert.rejects(control("on", "2"));
  process.env.AUTH_RECOVERY_DISPATCH_ENABLED = "true";
  assert.deepEqual(JSON.parse((await control("on", "2")).stdout), { enabled: true, generation: 3 });
  assert.equal(calls, 0);
});
test("two parallel workers produce one HTTP call and no replay", async () => {
  await queue();
  const results = await Promise.all([run(), run()]);
  assert.equal(results.filter(r => r.attempted).length, 1); assert.equal(calls, 1);
  assert.equal((await run()).status, "no_work"); assert.equal(calls, 1);
  assert.equal((await item()).state, "accepted"); assert.ok((await item()).dispatch_started_at);
});
test("independent Node worker processes still produce only one HTTP request", async () => {
  await queue();
  const server = createServer((req, res) => {
    calls++; req.resume(); req.on("end", () => { res.writeHead(201); res.end(JSON.stringify({ id: "22222222-aaaa-4444-8888-cccccccccccc" })); });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const execute = promisify(execFile);
    const childCode = `
      const { dispatchPasswordResetMailForTest } = require('./src/modules/auth/password-reset-dispatch.ts');
      const { db } = require('./src/db/index.ts');
      (async () => {
        const result = await dispatchPasswordResetMailForTest({ env: process.env, http: (url, init) => {
          if (url !== 'https://api.resend.com/emails') throw Error('Unexpected endpoint');
          return fetch('http://127.0.0.1:' + process.env.AUTH01_MOCK_PORT + '/emails', init);
        }});
        await db.$client.end(); process.stdout.write(JSON.stringify(result));
      })().catch(() => { process.exitCode = 1; });`;
    const worker = () => execute(process.execPath, ["--import", "tsx", "-e", childCode], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: connectionString, AUTH01_MOCK_PORT: String(address.port) },
    });
    const results = await Promise.all([worker(), worker()]);
    assert.equal(results.map(r => JSON.parse(r.stdout)).filter(r => r.attempted).length, 1);
    assert.equal(calls, 1); assert.equal((await item()).state, "accepted");
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
test("HTTP payload and idempotency are taken from the authenticated row", async () => {
  await queue(); const saved = await item();
  assert.equal((await run()).classification, "accepted");
  assert.equal(sentKey, saved.idempotency_key); assert.deepEqual(sentBody?.to, [email]);
  assert.ok(sentBody?.text.includes(origin + "/reset-password"));
  assert.equal(JSON.stringify(await item()).includes(sentBody!.text), false);
});
for (const evidence of [{ kind: "provider_accepted", acknowledged: true },
  { kind: "provider_rejected", definitivelyNotAccepted: true }, { kind: "transport_uncertain" }]) {
  test(`reserved finalizer blocks ${evidence.kind} before start commit`, async () => {
    await queue();
    const { finalizeReservedRecoveryProviderOutcomeOnce } = await import("../src/modules/auth/password-reset-request-outbox-finalize-reserved");
    const result = await run(mockHttp, { afterReservation: async () => {
      const before = await item();
      assert.equal(before.state, "in_flight"); assert.equal(before.dispatch_started_at, null); assert.equal(calls, 0);
      const finalized = await finalizeReservedRecoveryProviderOutcomeOnce({ outboxId: before.id, claimId: before.claim_id,
        reservationGeneration: before.dispatch_reservation_generation, evidence });
      assert.deepEqual(finalized, { ok: false, kind: "blocked", sendAuthorized: false, retryAuthorized: false });
      assert.deepEqual(await item(), before); assert.equal(calls, 0);
    } });
    assert.equal(result.status, "recorded"); assert.equal(result.classification, "accepted");
    assert.equal(calls, 1); assert.ok((await item()).dispatch_started_at);
  });
}
test("recovery of a pre-start abandoned claim is terminal; the old worker cannot send", async () => {
  await queue();
  const result = await run(mockHttp, { afterReservation: async () => {
    const before = await item(); assert.equal(before.dispatch_started_at, null); assert.equal(calls, 0);
    await pool.query("UPDATE password_reset_mail_outbox SET created_at=created_at-interval '6 minutes', claimed_at=claimed_at-interval '6 minutes', dispatch_fence_at=dispatch_fence_at-interval '6 minutes', dispatch_reservation_at=dispatch_reservation_at-interval '6 minutes' WHERE id=$1", [before.id]);
    assert.equal(await dispatch.recoverAbandonedPasswordResetDispatches(), 1);
    assert.equal((await item()).state, "uncertain"); assert.equal((await item()).dispatch_started_at, null);
  } });
  assert.equal(result.attempted, false); assert.equal(calls, 0);
  assert.equal((await run()).status, "no_work"); assert.equal(calls, 0);
});
test("reservation cannot be reused and the removed legacy finalizer is unavailable after start", async () => {
  await queue();
  await run(mockHttp, { beforeFinalize: async () => { throw Error("synthetic lost settlement"); } });
  const saved = await item();
  const { reservePendingRecoveryDispatchOnce } = await import("../src/modules/auth/password-reset-request-outbox-reserve");
  const claimer = await import("../src/modules/auth/password-reset-request-outbox-claim");
  assert.equal((await reservePendingRecoveryDispatchOnce({ outboxId: saved.id, claimId: saved.claim_id,
    expectedPublicOrigin: origin, keys: new Map([[key.keyId, key.bytes]]) })).ok, false);
  assert.equal(Reflect.get(claimer, "finalizeClaimedPasswordResetMail"), undefined);
  await run(); assert.equal(calls, 1);
});
for (const stage of ["claim", "fence", "reservation"]) {
  test(`removed legacy finalizer cannot settle ${stage} without start or HTTP`, async () => {
    await queue();
    const claimer = await import("../src/modules/auth/password-reset-request-outbox-claim");
    const fencer = await import("../src/modules/auth/password-reset-request-outbox-fence");
    const reserver = await import("../src/modules/auth/password-reset-request-outbox-reserve");
    const claim = await claimer.claimPendingPasswordResetMailOnce();
    assert.equal(claim.ok, true); if (!claim.ok) throw Error("fixture claim failed");
    const binding = { outboxId: claim.outboxId, claimId: claim.claimId, expectedPublicOrigin: origin, keys: new Map([[key.keyId, key.bytes]]) };
    if (stage !== "claim") assert.equal((await fencer.recordPendingRecoveryDispatchFenceOnce({ ...binding, operatorFenceEnabled: true })).ok, true);
    if (stage === "reservation") assert.equal((await reserver.reservePendingRecoveryDispatchOnce(binding)).ok, true);
    const before = await item();
    assert.equal(before.state, "in_flight"); assert.equal(before.dispatch_started_at, null);
    for (const result of ["accepted", "rejected", "uncertain"]) {
      assert.equal(Reflect.get(claimer, "finalizeClaimedPasswordResetMail"), undefined);
      assert.throws(() => Reflect.apply(Reflect.get(claimer, "finalizeClaimedPasswordResetMail"), undefined,
        [{ outboxId: claim.outboxId, claimId: claim.claimId, result }]), TypeError);
      assert.deepEqual(await item(), before); assert.equal(calls, 0);
    }
  });
}
test("reserved finalization after a committed outcome rejects every replay", async () => {
  await queue(); assert.equal((await run()).status, "recorded");
  const before = await item(); assert.ok(before.dispatch_started_at); assert.equal(before.state, "accepted");
  const { finalizeReservedRecoveryProviderOutcomeOnce } = await import("../src/modules/auth/password-reset-request-outbox-finalize-reserved");
  for (const evidence of [{ kind: "provider_accepted", acknowledged: true },
    { kind: "provider_rejected", definitivelyNotAccepted: true }, { kind: "transport_uncertain" }]) {
    assert.deepEqual(await finalizeReservedRecoveryProviderOutcomeOnce({ outboxId: before.id, claimId: before.claim_id,
      reservationGeneration: before.dispatch_reservation_generation, evidence }),
    { ok: false, kind: "blocked", sendAuthorized: false, retryAuthorized: false });
    assert.deepEqual(await item(), before); assert.equal(calls, 1);
  }
});
test("request API stays unavailable without provider settings and rejects foreign origins", async () => {
  delete process.env.RESEND_API_KEY;
  assert.equal((await requests.POST(request({ email }))).status, 503); assert.equal(await item(), undefined);
  Object.assign(process.env, env);
  const foreign = request({ email }); foreign.headers.set("origin", "https://foreign.example.invalid");
  assert.equal((await requests.POST(foreign)).status, 403); assert.equal(await item(), undefined);
});
test("request IP limit and account cooldown remain effective", async () => {
  for (let i = 0; i < 5; i++) assert.equal((await requests.POST(request({ email }))).status, 202);
  assert.equal((await requests.POST(request({ email }))).status, 429);
  const rows = await pool.query("SELECT count(*)::int AS n FROM password_reset_tokens WHERE user_id=$1", [userId]);
  assert.equal(rows.rows[0].n, 3); assert.equal(calls, 0);
});
test("reissued recovery revokes the old token and expires its unsent outbox", async () => {
  await queue(); const first = await item(); await queue();
  assert.equal((await pool.query("SELECT state FROM password_reset_mail_outbox WHERE id=$1", [first.id])).rows[0].state, "expired");
  assert.ok((await pool.query("SELECT revoked_at FROM password_reset_tokens WHERE id=$1", [first.password_reset_token_id])).rows[0].revoked_at);
  assert.equal((await run()).status, "recorded"); assert.equal(calls, 1);
});
for (const target of ["idempotency_key", "payload_digest"]) {
  test(`tampered ${target} before network start fails closed`, async () => {
    await queue();
    const result = await run(mockHttp, { afterReservation: async () => {
      await pool.query(`UPDATE password_reset_mail_outbox SET ${target}=$1 WHERE id=$2`, [target === "idempotency_key" ? randomBytes(24).toString("base64url") : "a".repeat(64), (await item()).id]);
    } });
    assert.equal(result.attempted, false); assert.equal(calls, 0); assert.equal((await item()).dispatch_started_at, null);
  });
}
for (const action of ["revoke", "mailbox", "off", "generation"]) {
  test(`${action} after reservation is rechecked before start`, async () => {
    await queue();
    const result = await run(mockHttp, { afterReservation: async () => {
      if (action === "revoke") await pool.query("UPDATE password_reset_tokens SET revoked_at=now() WHERE user_id=$1", [userId]);
      if (action === "mailbox") await pool.query("UPDATE users SET email=$1 WHERE id=$2", [`changed-${randomUUID()}@example.invalid`, userId]);
      if (action === "off") await pool.query("UPDATE password_reset_mail_dispatch_control SET enabled=false WHERE id=1");
      if (action === "generation") await pool.query("UPDATE password_reset_mail_dispatch_control SET generation=2 WHERE id=1");
    } });
    assert.equal(result.attempted, false); assert.equal(calls, 0);
  });
}
test("OFF after committed start does not prevent recording an accepted result", async () => {
  await queue();
  const result = await run(mockHttp, { afterStart: async () => { await pool.query("UPDATE password_reset_mail_dispatch_control SET enabled=false WHERE id=1"); } });
  assert.equal(result.classification, "accepted"); assert.equal(result.status, "recorded"); assert.equal(calls, 1);
});
test("exceptions before HTTP do not count as a network attempt", async () => {
  await queue();
  const result = await run(mockHttp, { afterStart: async () => { throw Error("synthetic crash after committed marker"); } });
  assert.equal(result.attempted, false); assert.equal(calls, 0); assert.ok((await item()).dispatch_started_at);
  assert.equal((await run()).status, "no_work"); assert.equal(calls, 0);
});
test("lost finalization acknowledgement never repeats HTTP; stale state recovers uncertain", async () => {
  await queue();
  const result = await run(mockHttp, { beforeFinalize: async () => { throw Error("synthetic database outage"); } });
  assert.equal(result.status, "not_recorded"); assert.equal(result.classification, "accepted");
  assert.equal((await item()).state, "in_flight");
  assert.equal((await run()).status, "no_work"); assert.equal(calls, 1);
  // Move only this fixture's history into the past, preserving all CHECKs.
  await pool.query("UPDATE password_reset_mail_outbox SET created_at=created_at-interval '6 minutes', claimed_at=claimed_at-interval '6 minutes', dispatch_fence_at=dispatch_fence_at-interval '6 minutes', dispatch_reservation_at=dispatch_reservation_at-interval '6 minutes', dispatch_started_at=dispatch_started_at-interval '6 minutes' WHERE id=$1", [(await item()).id]);
  assert.equal(await dispatch.recoverAbandonedPasswordResetDispatches(), 1);
  assert.equal((await item()).state, "uncertain");
  assert.equal((await run()).status, "no_work"); assert.equal(calls, 1);
});
for (const status of [400, 401, 403, 404, 422, 409, 429, 500, 502, 202]) {
  test(`provider status ${status} is terminal and never retried`, async () => {
    await queue(); const result = await run(async () => { calls++; return new Response("{}", { status }); });
    const expected = [400, 401, 403, 404, 422].includes(status) ? "rejected" : "uncertain";
    assert.equal(result.classification, expected); assert.equal((await item()).state, expected);
    await run(); assert.equal(calls, 1);
  });
}
for (const body of ["not json", JSON.stringify({ id: "invalid" }), JSON.stringify({ id: "22222222-aaaa-4444-8888-cccccccccccc", extra: true }), "x".repeat(4097)]) {
  test(`malformed or oversized accepted response (${body.length} bytes) is uncertain`, async () => {
    await queue(); const result = await run(async () => { calls++; return new Response(body, { status: 201 }); });
    assert.equal(result.classification, "uncertain"); await run(); assert.equal(calls, 1);
  });
}
test("timeout covers an HTTP implementation that ignores AbortSignal", async () => {
  await queue(); const started = Date.now();
  const result = await run(async () => { calls++; return new Promise<Response>(() => {}); });
  assert.equal(result.classification, "uncertain"); assert.ok(Date.now() - started < 15_000);
  await run(); assert.equal(calls, 1);
});
test("timeout also covers a stalled response body", async () => {
  await queue();
  const result = await run(async () => { calls++; return new Response(new ReadableStream({ start() {} }), { status: 201 }); });
  assert.equal(result.classification, "uncertain"); assert.equal((await item()).state, "uncertain");
  await run(); assert.equal(calls, 1);
});
test("transport exception is uncertain without leaking error contents", async () => {
  await queue(); const result = await run(async () => { calls++; throw Error(env.RESEND_API_KEY + email); });
  assert.equal(result.classification, "uncertain"); assert.ok(!JSON.stringify(result).includes(email)); assert.ok(!JSON.stringify(result).includes(env.RESEND_API_KEY));
  await run(); assert.equal(calls, 1);
});
test("real loopback mock HTTP receives one POST with persisted key", async () => {
  await queue(); const saved = await item();
  const server = createServer((req, res) => {
    calls++; assert.equal(req.method, "POST"); assert.equal(req.headers["idempotency-key"], saved.idempotency_key);
    req.resume(); req.on("end", () => { res.writeHead(201, { "Content-Type": "application/json" }); res.end(JSON.stringify({ id: "22222222-aaaa-4444-8888-cccccccccccc" })); });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const result = await run((_url, init) => nativeFetch(`http://127.0.0.1:${address.port}/emails`, init));
    assert.equal(result.classification, "accepted"); assert.equal(calls, 1);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
test("request responses hide known, unknown, inactive and unverified account states", async () => {
  const known = await requests.POST(request({ email })); assert.equal(known.status, 202); const ack = await known.json();
  const unknown = await requests.POST(request({ email: `unknown-${randomUUID()}@example.invalid` })); assert.deepEqual(await unknown.json(), ack);
  await pool.query("UPDATE users SET is_active=false WHERE id=$1", [userId]);
  assert.deepEqual(await (await requests.POST(request({ email }))).json(), ack);
  await pool.query("UPDATE users SET is_active=true,email_verified_at=NULL WHERE id=$1", [userId]);
  assert.deepEqual(await (await requests.POST(request({ email }))).json(), ack);
  assert.equal(calls, 0);
});
test("full request -> encrypted queue -> mock send -> redeem preserves diary and revokes sessions", async () => {
  comicId = (await pool.query("INSERT INTO comics(slug,title) VALUES($1,'Synthetic QA diary') RETURNING id", [randomUUID()])).rows[0].id;
  await pool.query("INSERT INTO user_comics(user_id,comic_id,status,current_chapter,rating_plot,personal_note) VALUES($1,$2,'READING',3,4,'private QA note')", [userId, comicId]);
  const diary = (await pool.query("SELECT * FROM user_comics WHERE user_id=$1", [userId])).rows;
  await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')", [userId, randomBytes(32).toString("hex")]);
  const response = await requests.POST(request({ email })); assert.equal(response.status, 202);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const saved = await item(); assert.equal(saved.state, "ready");
  const payload = crypto.unsealPasswordResetMailOutboxPayload({ payloadCiphertext: saved.payload_ciphertext, payloadNonce: saved.payload_nonce,
    payloadKeyId: saved.payload_key_id, payloadDigest: saved.payload_digest },
  { passwordResetTokenId: saved.password_reset_token_id, idempotencyKey: saved.idempotency_key, expiresAt: saved.expires_at }, new Map([[key.keyId, key.bytes]]));
  assert.ok(payload); assert.ok(!JSON.stringify(saved).includes(payload.token));
  assert.equal((await run()).classification, "accepted"); assert.ok(sentBody?.text.includes(payload.token));
  const redeem = () => redemption.POST(new NextRequest(origin + "/api/auth/password-reset/redeem", { method: "POST",
    headers: { host: "reader.example.invalid", origin, "content-type": "application/json", "x-real-ip": "192.0.2.3" },
    body: JSON.stringify({ token: payload.token, newPassword: "New-Password-456!", newPasswordConfirm: "New-Password-456!" }) }));
  const redeemed = await Promise.all([redeem(), redeem()]); assert.deepEqual(redeemed.map(r => r.status).sort(), [200, 400]);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM sessions WHERE user_id=$1", [userId])).rows[0].n, 0);
  const account = (await pool.query("SELECT password_hash,role FROM users WHERE id=$1", [userId])).rows[0];
  assert.equal(account.role, "USER"); assert.notEqual(account.password_hash, originalHash);
  assert.equal(await password.verifyPassword(account.password_hash, "New-Password-456!"), true);
  assert.deepEqual((await pool.query("SELECT * FROM user_comics WHERE user_id=$1", [userId])).rows, diary);
  await run(); assert.equal(calls, 1);
});
