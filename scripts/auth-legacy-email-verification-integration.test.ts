/** Disposable PG17 + injected HTTP only. No dotenv or real provider credentials. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { before, beforeEach, afterEach, after, test } from "node:test";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { hashSessionToken } from "../src/modules/auth/session-token";
import { hashPassword } from "../src/modules/auth/password";
import { issueEmailVerificationToken } from "../src/modules/auth/email-verification-token";
import { unsealActivationMailOutboxPayload } from "../src/modules/auth/registration-activation-outbox-crypto";

const target = process.env.LEGACY_TEST_DATABASE_URL;
if (!target) throw new Error("Set LEGACY_TEST_DATABASE_URL to disposable PostgreSQL");
const url = new URL(target);
const local = url.hostname === "127.0.0.1" && url.port === "55526" && url.username === "purpose01_qa" && url.pathname === "/purpose01_review";
const ci = process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_REPOSITORY === "Flawden/comic-diary" && url.hostname === "127.0.0.1" && url.port === "5432" && url.username === "comic_diary_ci" && url.pathname === "/comic_diary_release";
if (url.protocol !== "postgresql:" || (!local && !ci) || url.search || url.hash) throw new Error("REFUSED non-disposable PostgreSQL");
Object.assign(process.env, { DATABASE_URL: target, NODE_ENV: "test" });
const pool = new Pool({ connectionString: target });
const origin = "https://reader.example.invalid";
const key = randomBytes(32);
const password = "old"; // A valid historical password need not meet NEW-password policy.
const flags = { AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED: "true", AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED: "true",
  REGISTRATION_ACTIVATION_REDEEM_ENABLED: "true", AUTH_ACTIVATION_WORKER_ENABLED: "true", AUTH_ACTIVATION_DISPATCH_ENABLED: "true",
  AUTH_ACTIVATION_SENDER_VERIFIED: "true", AUTH_ACTIVATION_RESEND_CONFIG_READY: "true", RESEND_API_KEY: "re_SYNTHETIC_NOT_A_REAL_KEY",
  AUTH_ACTIVATION_FROM_ADDRESS: "mail@example.invalid", AUTH_ACTIVATION_SENDER_DOMAIN: "example.invalid",
  AUTH_ACTIVATION_PUBLIC_ORIGIN: origin, COMIC_DIARY_PUBLIC_ORIGIN: origin,
  AUTH_ACTIVATION_OUTBOX_KEY_ID: "legacy-test", AUTH_ACTIVATION_OUTBOX_KEY_BASE64: key.toString("base64") };
let service: typeof import("../src/modules/auth/legacy-email-verification-service");
let dispatcher: typeof import("../src/modules/auth/registration-activation-dispatch");
let requestRoute: typeof import("../src/app/api/account/email-verification/request/route");
let redeemRoute: typeof import("../src/app/api/account/email-verification/redeem/route");
let hash: string;
let userId: number;
let sessionToken: string;
let email: string;
let initialControl: Record<string, unknown>;
let ipCounter = 0;
const ipPrefix = `2001:db8:${randomBytes(2).toString("hex")}:${randomBytes(2).toString("hex")}`;
const originalFetch = globalThis.fetch;
const http = (action: "request" | "redeem", body: unknown, token = sessionToken, source = origin) => {
  const request = new NextRequest(`${origin}/api/account/email-verification/${action}`, {
    method: "POST", headers: { origin: source, host: "reader.example.invalid", "content-type": "application/json",
      "x-real-ip": `${ipPrefix}::${ipCounter}`, cookie: `comic_diary_session=${token}` }, body: JSON.stringify(body),
  });
  return action === "request" ? requestRoute.POST(request) : redeemRoute.POST(request);
};
const rows = async () => (await pool.query("SELECT t.*,o.id outbox_id,o.state,o.idempotency_key,o.payload_ciphertext,o.payload_nonce,o.payload_key_id,o.payload_digest,o.dispatch_started_at FROM email_verification_tokens t LEFT JOIN activation_mail_outbox o ON o.verification_token_id=t.id WHERE t.user_id=$1 ORDER BY t.id DESC", [userId])).rows;
async function code() {
  const row = (await rows())[0];
  const plain = unsealActivationMailOutboxPayload({ payloadCiphertext: row.payload_ciphertext, payloadNonce: row.payload_nonce,
    payloadKeyId: row.payload_key_id, payloadDigest: row.payload_digest }, { verificationTokenId: row.id,
    idempotencyKey: row.idempotency_key, expiresAt: row.expires_at, purpose: "legacy_email_verification" }, new Map([["legacy-test", key]]));
  assert.ok(plain); return plain.token;
}
before(async () => {
  assert.equal((await pool.query("SELECT current_setting('server_version_num')::int/10000 major")).rows[0].major, 17);
  initialControl = (await pool.query("SELECT * FROM activation_mail_dispatch_control WHERE id=1")).rows[0];
  hash = await hashPassword(password);
  globalThis.fetch = async () => { throw new Error("UNMOCKED NETWORK FORBIDDEN"); };
  service = await import("../src/modules/auth/legacy-email-verification-service");
  dispatcher = await import("../src/modules/auth/registration-activation-dispatch");
  requestRoute = await import("../src/app/api/account/email-verification/request/route");
  redeemRoute = await import("../src/app/api/account/email-verification/redeem/route");
});
beforeEach(async () => {
  Object.assign(process.env, flags); ipCounter++;
  email = `legacy-${randomUUID()}@example.invalid`; sessionToken = randomBytes(32).toString("base64url");
  userId = (await pool.query("INSERT INTO users(email,password_hash,verification_required_at) VALUES($1,$2,NULL) RETURNING id", [email, hash])).rows[0].id;
  await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')", [userId, hashSessionToken(sessionToken)]);
  await pool.query("UPDATE activation_mail_dispatch_control SET enabled=true,generation=1 WHERE id=1");
});
afterEach(async () => { await pool.query("DELETE FROM users WHERE id=$1", [userId]); });
after(async () => {
  globalThis.fetch = originalFetch; key.fill(0);
  try { await pool.query("UPDATE activation_mail_dispatch_control SET enabled=$1,generation=$2,updated_at=$3 WHERE id=1", [initialControl.enabled, initialControl.generation, initialControl.updated_at]); }
  finally { await pool.end(); }
});

test("HTTP -> encrypted outbox -> mock Resend -> code + password -> unchanged account/session -> existing recovery", async () => {
  const recovery = await import("../src/modules/auth/password-reset-request-outbox-issue");
  assert.equal((await recovery.enqueuePasswordResetMailForUser({ userId, publicOrigin: origin, key: { keyId: "legacy-test", bytes: key } })).ok, false);
  const before = (await pool.query("SELECT * FROM users WHERE id=$1", [userId])).rows[0];
  await pool.query("UPDATE sessions SET created_at=now()-interval '3 hours',last_seen_at=now()-interval '2 hours' WHERE user_id=$1", [userId]);
  const sessionsBefore = (await pool.query("SELECT * FROM sessions WHERE user_id=$1", [userId])).rows;
  const request = await http("request", { currentPassword: password });
  assert.equal(request.status, 202); assert.deepEqual(await request.json(), { ok: true }); assert.equal(request.headers.get("set-cookie"), null);
  let calls = 0; let sentCode = "";
  const queued = (await rows())[0];
  const sent = await dispatcher.dispatchActivationMailForTest({ env: process.env, http: async (endpoint, init) => {
    calls++; assert.equal(endpoint, "https://api.resend.com/emails");
    const body = JSON.parse(String(init.body)); assert.deepEqual(body.to, [email]);
    assert.ok(body.text.includes(origin + "/account")); assert.ok(!body.text.includes("/activate"));
    assert.equal(new Headers(init.headers).get("Idempotency-Key"), queued.idempotency_key);
    sentCode = body.text.match(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/)[0];
    return new Response(JSON.stringify({ id: "22222222-aaaa-4444-8888-cccccccccccc" }), { status: 201 });
  } });
  assert.equal(sent.classification, "accepted"); assert.equal(calls, 1);
  assert.equal((await http("redeem", { currentPassword: "wrong", token: sentCode })).status, 400);
  const success = await http("redeem", { currentPassword: password, token: sentCode });
  assert.equal(success.status, 200); assert.equal(success.headers.get("set-cookie"), null);
  const after = (await pool.query("SELECT * FROM users WHERE id=$1", [userId])).rows[0];
  assert.ok(after.email_verified_at); assert.deepEqual({ ...after, email_verified_at: before.email_verified_at, updated_at: before.updated_at }, before);
  assert.deepEqual((await pool.query("SELECT * FROM sessions WHERE user_id=$1", [userId])).rows, sessionsBefore);
  assert.equal((await http("redeem", { currentPassword: password, token: sentCode })).status, 400);
  assert.equal((await recovery.enqueuePasswordResetMailForUser({ userId, publicOrigin: origin, key: { keyId: "legacy-test", bytes: key } })).ok, true);
  const login = await import("../src/modules/auth/login-service"); assert.ok(await login.authenticatePasswordLogin(email, password));
  const resetControl = (await pool.query("SELECT * FROM password_reset_mail_dispatch_control WHERE id=1")).rows[0];
  try {
    Object.assign(process.env, { PASSWORD_RESET_REDEEM_ENABLED: "true", AUTH_RECOVERY_DISPATCH_ENABLED: "true",
      AUTH_RECOVERY_WORKER_ENABLED: "true", AUTH_RECOVERY_RESEND_CONFIG_READY: "true", AUTH_RECOVERY_SENDER_VERIFIED: "true",
      AUTH_RECOVERY_FROM_ADDRESS: "mail@example.invalid", AUTH_RECOVERY_SENDER_DOMAIN: "example.invalid",
      AUTH_RECOVERY_PUBLIC_ORIGIN: origin, PASSWORD_RESET_OUTBOX_KEY_ID: "legacy-test", PASSWORD_RESET_OUTBOX_KEY_BASE64: key.toString("base64") });
    await pool.query("UPDATE password_reset_mail_dispatch_control SET enabled=true,generation=1 WHERE id=1");
    const resetDispatch = await import("../src/modules/auth/password-reset-dispatch");
    let resetCode = "";
    const result = await resetDispatch.dispatchPasswordResetMailForTest({ env: process.env, http: async (_endpoint, init) => {
      const body = JSON.parse(String(init.body)); assert.deepEqual(body.to, [email]);
      resetCode = body.text.match(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/)[0];
      return new Response(JSON.stringify({ id: "22222222-aaaa-4444-8888-cccccccccccc" }), { status: 201 });
    } });
    assert.equal(result.classification, "accepted");
    const resetService = await import("../src/modules/auth/password-reset-service");
    assert.ok((await resetService.redeemPasswordResetToken(resetCode, "Recovered-Password-123!")).ok);
    assert.ok(await login.authenticatePasswordLogin(email, "Recovered-Password-123!"));
    assert.equal((await pool.query("SELECT count(*)::int n FROM sessions WHERE user_id=$1", [userId])).rows[0].n, 0);
  } finally { await pool.query("UPDATE password_reset_mail_dispatch_control SET enabled=$1,generation=$2,updated_at=$3 WHERE id=1", [resetControl.enabled, resetControl.generation, resetControl.updated_at]); }
});

test("no session, wrong password, arbitrary recipient and wrong Origin do not issue", async () => {
  assert.equal((await http("request", { currentPassword: password }, "")).status, 401);
  assert.equal((await http("request", { currentPassword: "wrong" })).status, 400);
  assert.equal((await http("request", { currentPassword: password, email: "other@example.invalid" })).status, 400);
  assert.equal((await http("request", { currentPassword: password }, sessionToken, "https://evil.invalid")).status, 403);
  assert.equal((await rows()).length, 0);
});
test("OFF gates, persisted OFF and missing readiness fail closed", async () => {
  for (const name of ["AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED", "AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED", "REGISTRATION_ACTIVATION_REDEEM_ENABLED", "AUTH_ACTIVATION_WORKER_ENABLED"]) {
    delete process.env[name]; assert.equal((await http("request", { currentPassword: password })).status, 503); Object.assign(process.env, flags);
  }
  await pool.query("UPDATE activation_mail_dispatch_control SET enabled=false WHERE id=1");
  assert.equal((await http("request", { currentPassword: password })).status, 503); assert.equal((await rows()).length, 0);
});
test("concurrent issue uses cooldown; concurrent redeem has exactly one winner", async () => {
  const outcomes = await Promise.all([1, 2, 3].map(() => service.requestOwnLegacyEmailVerification(sessionToken, password)));
  assert.ok(outcomes.every(r => r.ok)); assert.equal((await rows()).length, 1);
  const token = await code();
  const results = await Promise.all([1, 2].map(() => service.redeemOwnLegacyEmailVerification(sessionToken, password, token)));
  assert.equal(results.filter(r => r.ok).length, 1);
});
for (const action of ["request", "redeem"] as const) for (const race of ["password", "logout", "expiry"] as const)
  test(`${action}: ${race} after Argon2 but before locked recheck denies writes`, async () => {
    if (action === "redeem") assert.ok((await service.requestOwnLegacyEmailVerification(sessionToken, password)).ok);
    const token = action === "redeem" ? await code() : undefined;
    const result = await service.legacyVerificationForTest({ action, sessionToken, currentPassword: password, token,
      afterPasswordCheck: async () => {
        if (race === "password") await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2", [await hashPassword("replacement"), userId]);
        if (race === "logout") await pool.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
        if (race === "expiry") await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1", [userId]);
      } });
    assert.equal(result.ok, false);
    assert.equal((await pool.query("SELECT email_verified_at FROM users WHERE id=$1", [userId])).rows[0].email_verified_at, null);
    const items = await rows(); assert.equal(items.length, action === "request" ? 0 : 1);
    if (items[0]) assert.equal(items[0].consumed_at, null);
  });
test("same code cannot cross account, pending activation or historical token-only redemption", async () => {
  await service.requestOwnLegacyEmailVerification(sessionToken, password); const token = await code();
  const activation = await import("../src/modules/auth/registration-activation-service");
  assert.equal((await activation.activatePendingRegistrationWithEmailToken(token, "Replacement-Password-123!")).ok, false);
  const historical = await import("../src/modules/auth/email-verification-service");
  assert.equal((await historical.redeemEmailVerificationToken(token)).ok, false);
  await pool.query("UPDATE users SET verification_required_at=date_trunc('milliseconds',now()) WHERE id=$1", [userId]);
  assert.equal((await service.redeemOwnLegacyEmailVerification(sessionToken, password, token)).ok, false);
});
test("old issuer denies legacy and old redemption rejects both purposes without mutations", async () => {
  const historical = await import("../src/modules/auth/email-verification-service");
  assert.deepEqual(await historical.issueEmailVerificationForUser(userId), { ok: false, kind: "account_unavailable" });
  assert.equal((await rows()).length, 0);
  const issued = issueEmailVerificationToken();
  // Deliberately seed the exact former bypass: legacy USER + pending-purpose code.
  await pool.query("INSERT INTO email_verification_tokens(user_id,email_snapshot,token_hash,expires_at,purpose) VALUES($1,$2,$3,$4,'pending_activation')", [userId, email, issued.tokenHash, issued.expiresAt]);
  assert.equal((await service.redeemOwnLegacyEmailVerification(sessionToken, password, issued.token)).ok, false);
  for (const purpose of ["pending_activation", "legacy_email_verification"]) {
    await pool.query("UPDATE email_verification_tokens SET purpose=$1 WHERE user_id=$2", [purpose, userId]);
    const account = (await pool.query("SELECT * FROM users WHERE id=$1", [userId])).rows;
    const tokens = await rows();
    const savedSessions = (await pool.query("SELECT * FROM sessions WHERE user_id=$1", [userId])).rows;
    assert.deepEqual(await historical.issueEmailVerificationForUser(userId), { ok: false, kind: "account_unavailable" });
    assert.deepEqual(await historical.redeemEmailVerificationToken(issued.token), { ok: false, kind: "invalid_token" });
    assert.deepEqual(await historical.redeemEmailVerificationToken(issued.token), { ok: false, kind: "invalid_token" });
    assert.deepEqual((await pool.query("SELECT * FROM users WHERE id=$1", [userId])).rows, account);
    assert.deepEqual(await rows(), tokens);
    assert.deepEqual((await pool.query("SELECT * FROM sessions WHERE user_id=$1", [userId])).rows, savedSessions);
  }
});
test("historical pending issuer uses explicit purpose; only password-replacing pending activation redeems", async () => {
  const historical = await import("../src/modules/auth/email-verification-service");
  const activation = await import("../src/modules/auth/registration-activation-service");
  await pool.query("UPDATE users SET verification_required_at=date_trunc('milliseconds',now()) WHERE id=$1", [userId]);
  const issued = await historical.issueEmailVerificationForUser(userId); assert.ok(issued.ok);
  assert.equal((await rows())[0].purpose, "pending_activation");
  assert.equal((await historical.redeemEmailVerificationToken(issued.token)).ok, false);
  assert.ok((await activation.activatePendingRegistrationWithEmailToken(issued.token, "New-Pending-Password-123!")).ok);
  assert.equal((await activation.activatePendingRegistrationWithEmailToken(issued.token, "Other-Pending-Password-123!")).ok, false);
  const login = await import("../src/modules/auth/login-service");
  assert.ok(await login.authenticatePasswordLogin(email, "New-Pending-Password-123!"));
  assert.equal(await login.authenticatePasswordLogin(email, password), null);
});
test("intake OFF leaves existing code redeemable; main OFF skips READY without HTTP", async () => {
  await service.requestOwnLegacyEmailVerification(sessionToken, password); const token = await code();
  delete process.env.AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED;
  let calls = 0;
  await dispatcher.dispatchActivationMailForTest({ env: process.env, http: async () => { calls++; throw new Error("forbidden"); } });
  assert.equal(calls, 0); assert.equal((await rows())[0].state, "ready");
  Object.assign(process.env, flags); delete process.env.AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED;
  assert.equal((await http("request", { currentPassword: password })).status, 503);
  assert.equal((await http("redeem", { currentPassword: password, token })).status, 200);
});
test("oversized bodies and shared attempt limit are enforced", async () => {
  assert.equal((await http("request", { currentPassword: "x".repeat(5000) })).status, 413);
  for (let i = 0; i < 9; i++) await http("redeem", { currentPassword: "wrong", token: "A".repeat(43) });
  assert.equal((await http("request", { currentPassword: password })).status, 429);
  assert.equal((await rows()).length, 0);
});
for (const table of ["activation_mail_outbox", "users"] as const) test(`fault injection on ${table} rolls back challenge writes`, async () => {
  if (table === "users") await service.requestOwnLegacyEmailVerification(sessionToken, password);
  const token = table === "users" ? await code() : undefined;
  await pool.query(`CREATE FUNCTION legacy_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic fixture failure'; END $$`);
  await pool.query(`CREATE TRIGGER legacy_fixture_fail BEFORE ${table === "users" ? "UPDATE OF email_verified_at" : "INSERT"} ON ${table} FOR EACH ROW EXECUTE FUNCTION legacy_fixture_fail()`);
  try {
    const response = table === "users" ? await http("redeem", { currentPassword: password, token })
      : await http("request", { currentPassword: password });
    assert.equal(response.status, 503);
    await assert.rejects(table === "users" ? service.redeemOwnLegacyEmailVerification(sessionToken, password, token)
      : service.requestOwnLegacyEmailVerification(sessionToken, password));
    const items = await rows(); assert.equal(items.length, table === "users" ? 1 : 0);
    if (items[0]) assert.equal(items[0].consumed_at, null);
  } finally { await pool.query(`DROP TRIGGER legacy_fixture_fail ON ${table}`); await pool.query("DROP FUNCTION legacy_fixture_fail()"); }
});
for (const outcome of ["accepted", "rejected", "uncertain"] as const) test(`concurrent legacy dispatch ${outcome} is terminal with no repeat HTTP`, async () => {
  await service.requestOwnLegacyEmailVerification(sessionToken, password); let calls = 0;
  const transport = async () => { calls++; if (outcome === "uncertain") throw new Error("lost response");
    return outcome === "accepted" ? new Response(JSON.stringify({ id: "22222222-aaaa-4444-8888-cccccccccccc" }), { status: 201 }) : new Response("", { status: 422 }); };
  await Promise.all([1, 2].map(() => dispatcher.dispatchActivationMailForTest({ env: process.env, http: transport })));
  await dispatcher.dispatchActivationMailForTest({ env: process.env, http: transport });
  assert.equal(calls, 1); assert.equal((await rows())[0].state, outcome);
});

async function waitForLock(fragment: string) {
  for (let i = 0; i < 200; i++) {
    const [row] = (await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1", [fragment])).rows;
    if (row.n > 0) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail("expected independent PostgreSQL connection to wait on lock");
}
test("password UPDATE committed while verifier waits on USER invalidates the Argon snapshot", async () => {
  await service.requestOwnLegacyEmailVerification(sessionToken, password); const token = await code();
  const locker = await pool.connect(); let operation: Promise<unknown> | undefined;
  try {
    await locker.query("BEGIN"); await locker.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    let checked!: () => void; const ready = new Promise<void>(resolve => { checked = resolve; });
    operation = service.legacyVerificationForTest({ action: "redeem", sessionToken, currentPassword: password, token, afterPasswordCheck: async () => { checked(); } });
    await ready; await waitForLock('%from "users"%for update%');
    await locker.query("UPDATE users SET password_hash=$1 WHERE id=$2", [await hashPassword("replacement"), userId]);
    await locker.query("COMMIT"); assert.equal((await operation as { ok: boolean }).ok, false);
    assert.equal((await rows())[0].consumed_at, null);
  } finally { await locker.query("ROLLBACK"); locker.release(); await operation; }
});
for (const mutation of ["logout", "password"] as const) test(`verification locks precede concurrent ${mutation}; no deadlock or stale authorization`, async () => {
  await service.requestOwnLegacyEmailVerification(sessionToken, password); const token = await code();
  const locker = await pool.connect(); let redeem: Promise<unknown> | undefined; let change: Promise<unknown> | undefined;
  await pool.query("CREATE FUNCTION legacy_lock_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(8472047); RETURN NEW; END $$");
  await pool.query("CREATE TRIGGER legacy_lock_barrier BEFORE UPDATE OF email_verified_at ON users FOR EACH ROW EXECUTE FUNCTION legacy_lock_barrier()");
  try {
    await locker.query("SELECT pg_advisory_lock(8472047)");
    redeem = service.redeemOwnLegacyEmailVerification(sessionToken, password, token);
    await waitForLock('%update "users"%email_verified_at%');
    if (mutation === "logout") change = pool.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
    else {
      const passwordService = await import("../src/modules/auth/password-change-service");
      change = passwordService.changeOwnPassword(userId, password, "Replacement-Password-123!");
    }
    await waitForLock(mutation === "logout" ? 'DELETE FROM sessions%' : '%from "users"%for update%');
    await locker.query("SELECT pg_advisory_unlock(8472047)");
    assert.equal((await redeem as { ok: boolean }).ok, true); await change;
    assert.ok((await rows())[0].consumed_at);
  } finally {
    await locker.query("SELECT pg_advisory_unlock(8472047)"); locker.release(); await redeem; await change;
    await pool.query("DROP TRIGGER legacy_lock_barrier ON users"); await pool.query("DROP FUNCTION legacy_lock_barrier()");
  }
});
test("foreign session, verified user, expired/revoked token and changed email are rejected", async () => {
  await service.requestOwnLegacyEmailVerification(sessionToken, password); const token = await code();
  const foreign = (await pool.query("INSERT INTO users(email,password_hash,verification_required_at) VALUES($1,$2,NULL) RETURNING id", [randomUUID()+"@example.invalid", hash])).rows[0].id;
  const foreignToken = randomBytes(32).toString("base64url");
  try {
    await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')", [foreign, hashSessionToken(foreignToken)]);
    assert.equal((await service.redeemOwnLegacyEmailVerification(foreignToken, password, token)).ok, false);
    await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [foreign]);
    assert.equal((await service.requestOwnLegacyEmailVerification(foreignToken, password)).ok, false);
  } finally { await pool.query("DELETE FROM users WHERE id=$1", [foreign]); }
  await pool.query("UPDATE users SET email=$1 WHERE id=$2", [randomUUID()+"@example.invalid", userId]);
  assert.equal((await service.redeemOwnLegacyEmailVerification(sessionToken, password, token)).ok, false);
  await pool.query("UPDATE users SET email=$1 WHERE id=$2", [email, userId]);
  await pool.query("UPDATE email_verification_tokens SET revoked_at=now() WHERE user_id=$1", [userId]);
  assert.equal((await service.redeemOwnLegacyEmailVerification(sessionToken, password, token)).ok, false);
  await pool.query("UPDATE email_verification_tokens SET revoked_at=NULL,created_at=now()-interval '31 minutes',expires_at=now()-interval '1 minute' WHERE user_id=$1", [userId]);
  assert.equal((await service.redeemOwnLegacyEmailVerification(sessionToken, password, token)).ok, false);
});
test("manual fresh issuance revokes previous code; old uncertain never retries", async () => {
  await service.requestOwnLegacyEmailVerification(sessionToken, password); const old = await code();
  await dispatcher.dispatchActivationMailForTest({ env: process.env, http: async () => { throw new Error("lost response"); } });
  await pool.query("UPDATE email_verification_tokens SET created_at=created_at-interval '2 minutes' WHERE user_id=$1", [userId]);
  await service.requestOwnLegacyEmailVerification(sessionToken, password); assert.equal((await rows()).length, 2);
  assert.equal((await service.redeemOwnLegacyEmailVerification(sessionToken, password, old)).ok, false);
  assert.equal((await rows())[1].state, "uncertain");
  assert.ok((await service.redeemOwnLegacyEmailVerification(sessionToken, password, await code())).ok);
});
test("legacy OFF before start blocks HTTP; OFF after start permits outcome settlement", async () => {
  await service.requestOwnLegacyEmailVerification(sessionToken, password); let calls = 0;
  const transport = async () => { calls++; return new Response(JSON.stringify({ id: "22222222-aaaa-4444-8888-cccccccccccc" }), { status: 201 }); };
  const denied = await dispatcher.dispatchActivationMailForTest({ env: process.env, http: transport,
    hooks: { afterReservation: async () => { await pool.query("UPDATE activation_mail_dispatch_control SET enabled=false,generation=generation+1 WHERE id=1"); } } });
  assert.equal(denied.attempted, false); assert.equal(calls, 0);
  await pool.query("UPDATE email_verification_tokens SET created_at=created_at-interval '2 minutes' WHERE user_id=$1", [userId]);
  await pool.query("UPDATE activation_mail_dispatch_control SET enabled=true,generation=generation+1 WHERE id=1");
  await service.requestOwnLegacyEmailVerification(sessionToken, password);
  const sent = await dispatcher.dispatchActivationMailForTest({ env: process.env, http: transport,
    hooks: { afterStart: async () => { delete process.env.AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED;
      await pool.query("UPDATE activation_mail_dispatch_control SET enabled=false,generation=generation+1 WHERE id=1"); } } });
  assert.equal(sent.status, "recorded"); assert.equal(calls, 1); assert.equal((await rows())[0].state, "accepted");
});
test("disabled legacy jobs before the candidate limit cannot starve pending activation", async () => {
  const created: number[] = [];
  const issuer = await import("../src/modules/auth/registration-activation-outbox-issue");
  try {
    const applicationDb = await import("../src/db");
    for (let i = 0; i < 17; i++) {
      const owner = (await pool.query("INSERT INTO users(email,password_hash,verification_required_at) VALUES($1,$2,NULL) RETURNING id", [randomUUID()+"@example.invalid", hash])).rows[0].id;
      created.push(owner);
      await applicationDb.db.transaction(tx => issuer.enqueueVerificationMailInTransaction(tx,
        { userId: owner, publicOrigin: origin, key: { keyId: "legacy-test", bytes: key } }, "legacy_email_verification"));
    }
    const pending = (await pool.query("INSERT INTO users(email,password_hash,verification_required_at) VALUES($1,$2,now()) RETURNING id", [randomUUID()+"@example.invalid", hash])).rows[0].id;
    created.push(pending);
    assert.ok((await issuer.enqueuePendingActivationMailForUser({ userId: pending, publicOrigin: origin, key: { keyId: "legacy-test", bytes: key } })).ok);
    delete process.env.AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED; let calls = 0;
    const result = await dispatcher.dispatchActivationMailForTest({ env: process.env, http: async (_endpoint, init) => {
      calls++; assert.ok(JSON.parse(String(init.body)).text.includes(origin+"/activate"));
      return new Response(JSON.stringify({ id: "22222222-aaaa-4444-8888-cccccccccccc" }), { status: 201 });
    } });
    assert.equal(result.status, "recorded"); assert.equal(calls, 1);
    assert.equal((await pool.query("SELECT count(*)::int n FROM activation_mail_outbox o JOIN email_verification_tokens t ON t.id=o.verification_token_id WHERE t.user_id=ANY($1) AND t.purpose='legacy_email_verification' AND o.state='ready'", [created])).rows[0].n, 17);
  } finally { await pool.query("DELETE FROM users WHERE id=ANY($1)", [created]); }
});
test("five historical users retain ordinary authorization with legacy feature OFF", async () => {
  delete process.env.AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED;
  const login = await import("../src/modules/auth/login-service");
  const sessionService = await import("../src/modules/auth/session-service");
  const created: number[] = [];
  try {
    for (let i = 0; i < 5; i++) {
      const address = randomUUID()+"@example.invalid";
      const owner = (await pool.query("INSERT INTO users(email,password_hash,verification_required_at) VALUES($1,$2,NULL) RETURNING id", [address, hash])).rows[0].id;
      created.push(owner); assert.ok(await login.authenticatePasswordLogin(address, password));
      const session = await sessionService.createUserSession(owner); assert.ok(await sessionService.getAuthenticatedSession(session.token));
      assert.equal((await service.requestOwnLegacyEmailVerification(session.token, password)).ok, false);
    }
    assert.equal((await pool.query("SELECT count(*)::int n FROM users WHERE id=ANY($1) AND email_verified_at IS NULL AND verification_required_at IS NULL AND password_hash=$2", [created, hash])).rows[0].n, 5);
  } finally { await pool.query("DELETE FROM users WHERE id=ANY($1)", [created]); }
});
test("rate-limit database failure fails closed before issuance", async () => {
  await pool.query("CREATE FUNCTION legacy_limiter_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic limiter failure'; END $$");
  await pool.query("CREATE TRIGGER legacy_limiter_fail BEFORE INSERT ON auth_rate_limits FOR EACH ROW EXECUTE FUNCTION legacy_limiter_fail()");
  try { assert.equal((await http("request", { currentPassword: password })).status, 503); assert.equal((await rows()).length, 0); }
  finally { await pool.query("DROP TRIGGER legacy_limiter_fail ON auth_rate_limits"); await pool.query("DROP FUNCTION legacy_limiter_fail()"); }
});
test("hourly legacy issuance limit preserves credentials and the latest code", async () => {
  for (let i = 0; i < 7; i++) {
    await pool.query("UPDATE email_verification_tokens SET created_at=now()-interval '2 minutes' WHERE user_id=$1", [userId]);
    assert.ok((await service.requestOwnLegacyEmailVerification(sessionToken, password)).ok);
  }
  assert.equal((await rows()).length, 5);
  const token = await code(); assert.ok((await service.redeemOwnLegacyEmailVerification(sessionToken, password, token)).ok);
  assert.equal((await pool.query("SELECT password_hash FROM users WHERE id=$1", [userId])).rows[0].password_hash, hash);
});
test("bounded provider timeout records uncertain once without a second HTTP", async () => {
  await service.requestOwnLegacyEmailVerification(sessionToken, password); let calls = 0;
  const transport = async () => { calls++; return new Promise<Response>(() => {}); };
  const result = await dispatcher.dispatchActivationMailForTest({ env: process.env, http: transport });
  assert.equal(result.classification, "uncertain"); assert.equal((await rows())[0].state, "uncertain");
  await dispatcher.dispatchActivationMailForTest({ env: process.env, http: transport }); assert.equal(calls, 1);
});
