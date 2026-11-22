/** Explicit disposable PG17, synthetic identities and mock HTTP only. No dotenv. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { before, beforeEach, after, afterEach, test } from 'node:test';
import { Pool } from 'pg';
const target = process.env.BETA_TEST_DATABASE_URL;
if (!target) throw Error('Explicit disposable target required');
const url = new URL(target);
const local =
  url.hostname === '127.0.0.1' &&
  url.port === '55588' &&
  url.username === 'beta01_qa' &&
  url.pathname === '/beta01_review';
const ci =
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_REPOSITORY === 'Flawden/comic-diary' &&
  url.hostname === '127.0.0.1' &&
  url.port === '5432' &&
  url.username === 'comic_diary_ci' &&
  url.pathname === '/comic_diary_release';
if (url.protocol !== 'postgresql:' || (!local && !ci) || url.search || url.hash)
  throw Error('Refused target');
Object.assign(process.env, { DATABASE_URL: target, NODE_ENV: 'test' });
const pool = new Pool({ connectionString: target });
const q = (s: string, v: unknown[] = []) => pool.query(s, v);
const key = randomBytes(32),
  origin = 'https://reader.example.invalid';
const flags = {
  REGISTRATION_ENABLED: 'false',
  REGISTRATION_ACTIVATION_REDEEM_ENABLED: 'true',
  AUTH_ACTIVATION_WORKER_ENABLED: 'true',
  AUTH_ACTIVATION_DISPATCH_ENABLED: 'true',
  AUTH_ACTIVATION_RESEND_CONFIG_READY: 'true',
  AUTH_ACTIVATION_SENDER_VERIFIED: 'true',
  AUTH_ACTIVATION_OPERATOR_CONTROL_ENABLED: 'true',
  AUTH_ACTIVATION_FROM_ADDRESS: 'mail@example.invalid',
  AUTH_ACTIVATION_SENDER_DOMAIN: 'example.invalid',
  AUTH_ACTIVATION_PUBLIC_ORIGIN: origin,
  COMIC_DIARY_PUBLIC_ORIGIN: origin,
  RESEND_API_KEY: 're_SYNTHETIC_NOT_A_REAL_KEY',
  AUTH_ACTIVATION_OUTBOX_KEY_ID: 'beta-test',
  AUTH_ACTIVATION_OUTBOX_KEY_BASE64: key.toString('base64'),
  AUTH_BETA_INVITATION_REGISTRATION_ENABLED: 'true',
  AUTH_BETA_INVITATION_DISPATCH_ENABLED: 'true',
};
type Actor = { userId: number; sessionId: number };
let actors: Actor[], prefix: string, email: string;
let savedControl: Record<string, unknown>;
let baselinePilot: Record<string, unknown>;
let admin: typeof import('../src/modules/auth/beta-invitation-admin'),
  service: typeof import('../src/modules/auth/beta-invitation-service'),
  activation: typeof import('../src/modules/auth/registration-activation-service'),
  dispatch: typeof import('../src/modules/auth/registration-activation-dispatch');
const native = globalThis.fetch;
const pilot = async () =>
  (
    await q(
      'SELECT pilot_id,pilot_user_id,pilot_outbox_id,pilot_armed_at,pilot_dispatch_used_at,pilot_closed_at FROM activation_mail_dispatch_control WHERE id=1',
    )
  ).rows[0];
const request = (secret: string, intent = 'register') =>
  intent === 'register'
    ? {
        intent,
        invitation: secret,
        email,
        password: 'beta-password-long',
        passwordConfirm: 'beta-password-long',
      }
    : { intent, invitation: secret, email };
const jobs = async () =>
  (
    await q(
      'SELECT o.* FROM activation_mail_outbox o JOIN email_verification_tokens t ON t.id=o.verification_token_id JOIN users u ON u.id=t.user_id WHERE u.email LIKE $1 ORDER BY o.id',
      [prefix + '%'],
    )
  ).rows;
before(async () => {
  assert.equal(
    (await q("SELECT current_setting('server_version_num')::int/10000 n"))
      .rows[0].n,
    17,
  );
  savedControl = (
    await q('SELECT * FROM activation_mail_dispatch_control WHERE id=1')
  ).rows[0];
  globalThis.fetch = async () => {
    throw Error('Provider HTTP forbidden');
  };
  admin = await import('../src/modules/auth/beta-invitation-admin');
  service = await import('../src/modules/auth/beta-invitation-service');
  activation = await import(
    '../src/modules/auth/registration-activation-service'
  );
  dispatch = await import(
    '../src/modules/auth/registration-activation-dispatch'
  );
});
beforeEach(async () => {
  Object.assign(process.env, flags);
  await q("UPDATE site_access_policy SET public_registration=false,beta_only=false WHERE id=1");
  prefix = 'beta-' + randomUUID();
  email = prefix + '@example.invalid';
  actors = [];
  for (const role of ['ADMIN', 'EDITOR', 'USER']) {
    const u = (
      await q(
        "INSERT INTO users(email,password_hash,role,email_verified_at) VALUES($1,'synthetic-unused',$2,now()) RETURNING id",
        [prefix + '-' + role + '@example.invalid', role],
      )
    ).rows[0].id;
    const s = (
      await q(
        "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour') RETURNING id",
        [u, createHash('sha256').update(randomBytes(32)).digest('hex')],
      )
    ).rows[0].id;
    actors.push({ userId: u, sessionId: s });
  }
  await q('DELETE FROM activation_mail_dispatch_control WHERE id=1');
  await q(
    "INSERT INTO activation_mail_dispatch_control(id,enabled,generation,pilot_id,pilot_user_id,pilot_outbox_id,pilot_armed_at,pilot_dispatch_used_at,pilot_closed_at) VALUES(1,true,7,$1,1,1,now()-interval '3 hours',now()-interval '2 hours',now()-interval '1 hour')",
    [randomUUID()],
  );
  baselinePilot = await pilot();
});
afterEach(async () => {
  assert.deepEqual(await pilot(), baselinePilot);
  await q(
    'DELETE FROM email_verification_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)',
    [prefix + '%'],
  );
  await q(
    'DELETE FROM beta_registration_invitations WHERE created_by_user_id=$1',
    [actors[0].userId],
  );
  await q('DELETE FROM site_access_events WHERE actor_user_id=$1',[actors[0].userId]);
  await q('DELETE FROM users WHERE email LIKE $1', [prefix + '%']);
  await q('UPDATE site_access_policy SET public_registration=false,beta_only=false WHERE id=1');
});
after(async () => {
  globalThis.fetch = native;
  await q('DELETE FROM activation_mail_dispatch_control WHERE id=1');
  const cols = Object.keys(savedControl);
  await q(
    'INSERT INTO activation_mail_dispatch_control(' +
      cols.join(',') +
      ') VALUES(' +
      cols.map((_, i) => '$' + (i + 1)).join(',') +
      ')',
    cols.map((k) => savedControl[k]),
  );
  await pool.end();
  const { db } = await import('../src/db');
  await db.$client.end();
});
async function invite() {
  return admin.createBetaInvitation(actors[0], email);
}
async function code() {
  const row = (await jobs()).at(-1)!;
  const { unsealActivationMailOutboxPayload } = await import(
    '../src/modules/auth/registration-activation-outbox-crypto'
  );
  const t = (
    await q('SELECT * FROM email_verification_tokens WHERE id=$1', [
      row.verification_token_id,
    ])
  ).rows[0];
  const payload = unsealActivationMailOutboxPayload(
    {
      payloadCiphertext: row.payload_ciphertext,
      payloadNonce: row.payload_nonce,
      payloadKeyId: row.payload_key_id,
      payloadDigest: row.payload_digest,
    },
    {
      verificationTokenId: t.id,
      idempotencyKey: row.idempotency_key,
      expiresAt: t.expires_at,
      purpose: t.purpose,
    },
    new Map([['beta-test', key]]),
    new Date(),
  );
  assert.ok(payload);
  return payload.token;
}
const transport =
  (onCall: () => void, outcome = 'accepted') =>
  async () => {
    onCall();
    if (outcome === 'uncertain') throw Error('mock lost response');
    return new Response(
      outcome === 'accepted'
        ? JSON.stringify({ id: '22222222-aaaa-4444-8888-cccccccccccc' })
        : '',
      { status: outcome === 'accepted' ? 201 : 422 },
    );
  };

test('email-first concurrent requests bind one account and job; no supplied password, replay cannot reset credential', async () => {
  const made = await invite();
  const input = { intent: 'request', invitation: made.secret, email };
  await Promise.all(
    Array.from({ length: 8 }, () => service.registerWithBetaInvitation(input)),
  );
  const accounts = (
    await q(
      'SELECT id,password_hash,email_verified_at FROM users WHERE email=$1',
      [email],
    )
  ).rows;
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].email_verified_at, null);
  assert.ok(accounts[0].password_hash);
  assert.equal((await jobs()).length, 1);
  await service.registerWithBetaInvitation(input);
  assert.equal((await jobs()).length, 1);
  assert.equal(
    (await q('SELECT password_hash FROM users WHERE id=$1', [accounts[0].id]))
      .rows[0].password_hash,
    accounts[0].password_hash,
  );
  const { verifyPassword } = await import('../src/modules/auth/password');
  assert.equal(
    await verifyPassword(accounts[0].password_hash, 'beta-password-long'),
    false,
  );
  const token = await code();
  assert.equal(
    (
      await activation.activatePendingRegistrationWithEmailToken(
        token,
        'final-email-first-password',
      )
    ).ok,
    true,
  );
  const updated = (
    await q('SELECT password_hash,email_verified_at FROM users WHERE id=$1', [
      accounts[0].id,
    ])
  ).rows[0];
  assert.ok(updated.email_verified_at);
  assert.equal(
    await verifyPassword(updated.password_hash, 'final-email-first-password'),
    true,
  );
});

test('email-first rejects foreign address, injected account ID and credential fields without writes', async () => {
  const made = await invite();
  const input = { intent: 'request', invitation: made.secret, email };
  for (const value of [
    { ...input, email: 'foreign@example.invalid' },
    { ...input, userId: actors[2].userId },
    { ...input, password: 'unrequested-password' },
  ]) {
    await assert.rejects(service.registerWithBetaInvitation(value), {
      status: 400,
    });
  }
  assert.equal((await jobs()).length, 0);
  assert.equal(
    (await q('SELECT id FROM users WHERE email=$1', [email])).rowCount,
    0,
  );
});

test('ADMIN creates hash-only seven-day invitation without a user; list has no recoverable secret', async () => {
  const count = (await q('SELECT count(*)::int n FROM users')).rows[0].n;
  const made = await invite();
  assert.equal(made.secret.length, 43);
  const row = (
    await q('SELECT * FROM beta_registration_invitations WHERE id=$1', [
      made.id,
    ])
  ).rows[0];
  assert.equal(row.secret_hash.length, 64);
  assert.equal(row.pending_user_id, null);
  assert.equal(row.expires_at - row.created_at, 604800000);
  assert.equal((await q('SELECT count(*)::int n FROM users')).rows[0].n, count);
  const listed = JSON.stringify(await admin.listBetaInvitations(actors[0]));
  assert.ok(!listed.includes(made.secret) && !listed.includes(row.secret_hash));
  assert.equal(
    (
      await q(
        'SELECT action FROM beta_invitation_events WHERE invitation_id=$1',
        [made.id],
      )
    ).rows[0].action,
    'CREATED',
  );
});
test('USER/EDITOR, expired, revoked and demoted administrator sessions cannot manage invitations', async () => {
  for (const a of actors.slice(1)) {
    await assert.rejects(admin.createBetaInvitation(a, email), { status: 403 });
    await assert.rejects(admin.listBetaInvitations(a), { status: 403 });
  }
  const made = await invite();
  await assert.rejects(admin.revokeBetaInvitation(actors[1], made.id), {
    status: 403,
  });
  await q("UPDATE users SET role='EDITOR' WHERE id=$1", [actors[0].userId]);
  await assert.rejects(admin.createBetaInvitation(actors[0], email), {
    status: 403,
  });
  await q("UPDATE users SET role='ADMIN' WHERE id=$1", [actors[0].userId]);
  await q(
    "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
    [actors[0].sessionId],
  );
  await assert.rejects(admin.createBetaInvitation(actors[0], email), {
    status: 401,
  });
  await assert.rejects(admin.listBetaInvitations(actors[0]), { status: 401 });
  await assert.rejects(admin.revokeBetaInvitation(actors[0], made.id), {
    status: 401,
  });
  await q(
    "UPDATE sessions SET expires_at=now()+interval '1 hour' WHERE id=$1",
    [actors[0].sessionId],
  );
  await q('UPDATE users SET is_active=false WHERE id=$1', [actors[0].userId]);
  await assert.rejects(admin.createBetaInvitation(actors[0], email), {
    status: 401,
  });
  await assert.rejects(admin.listBetaInvitations(actors[0]), { status: 401 });
  await q('UPDATE users SET is_active=true WHERE id=$1', [actors[0].userId]);
  await q('DELETE FROM sessions WHERE id=$1', [actors[0].sessionId]);
  await assert.rejects(admin.revokeBetaInvitation(actors[0], made.id), {
    status: 401,
  });
});
test('inspect never consumes; concurrent registration binds one pending USER and one encrypted job', async () => {
  const made = await invite();
  await service.inspectBetaInvitation(made.secret);
  await service.inspectBetaInvitation(made.secret);
  assert.equal(
    (
      await q(
        'SELECT pending_user_id FROM beta_registration_invitations WHERE id=$1',
        [made.id],
      )
    ).rows[0].pending_user_id,
    null,
  );
  const before = (
    await q('SELECT * FROM users WHERE id=ANY($1::int[])', [
      actors.map((a) => a.userId),
    ])
  ).rows;
  await Promise.all(
    Array.from({ length: 8 }, () =>
      service.registerWithBetaInvitation(request(made.secret)),
    ),
  );
  const row = (await q('SELECT * FROM users WHERE email=$1', [email])).rows[0];
  assert.equal(row.role, 'USER');
  assert.equal(row.email_verified_at, null);
  assert.ok(row.verification_required_at);
  assert.equal(
    (await q('SELECT count(*)::int n FROM sessions WHERE user_id=$1', [row.id]))
      .rows[0].n,
    0,
  );
  assert.equal((await jobs()).length, 1);
  assert.equal(
    (
      await q(
        'SELECT invitation_id FROM email_verification_tokens WHERE user_id=$1',
        [row.id],
      )
    ).rows[0].invitation_id,
    made.id,
  );
  assert.deepEqual(
    (
      await q('SELECT * FROM users WHERE id=ANY($1::int[])', [
        actors.map((a) => a.userId),
      ])
    ).rows,
    before,
  );
});
test('wrong email, user-ID injection, missing invitation and public registration cannot bypass beta', async () => {
  const made = await invite();
  for (const v of [
    { ...request(made.secret), email: 'other@example.invalid' },
    { ...request(made.secret), userId: actors[2].userId },
    { ...request(made.secret), invitation: '' },
  ])
    await assert.rejects(service.registerWithBetaInvitation(v), {
      status: 400,
    });
  const { registerPasswordUser } = await import(
    '../src/modules/auth/registration-service'
  );
  process.env.REGISTRATION_ENABLED = 'true';
  assert.deepEqual(await registerPasswordUser(email, 'beta-password-long'), {
    ok: false,
    kind: 'registration_unavailable',
  });
  assert.equal((await jobs()).length, 0);
});
test('outbox fault rolls back pending user, binding, token and all writes', async () => {
  const made = await invite();
  await q(
    "CREATE FUNCTION beta_test_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic outbox fault'; END $$",
  );
  await q(
    'CREATE TRIGGER beta_test_fault BEFORE INSERT ON activation_mail_outbox FOR EACH ROW EXECUTE FUNCTION beta_test_fault()',
  );
  try {
    await assert.rejects(
      service.registerWithBetaInvitation(request(made.secret)),
    );
    assert.equal(
      (await q('SELECT id FROM users WHERE email=$1', [email])).rowCount,
      0,
    );
    assert.equal(
      (
        await q(
          'SELECT pending_user_id FROM beta_registration_invitations WHERE id=$1',
          [made.id],
        )
      ).rows[0].pending_user_id,
      null,
    );
  } finally {
    await q('DROP TRIGGER beta_test_fault ON activation_mail_outbox');
    await q('DROP FUNCTION beta_test_fault()');
  }
});
test('lost registration commit acknowledgement is safely replayed without a second job or password replacement', async () => {
  const made = await invite();
  const { db } = await import('../src/db');
  const original = db.transaction,
    bound = original.bind(db);
  db.transaction = ((...a: Parameters<typeof bound>) =>
    bound(...a).then((r) => {
      if (r && typeof r === 'object' && 'activationRequired' in r)
        throw Error('lost commit acknowledgement');
      return r;
    })) as typeof db.transaction;
  try {
    await assert.rejects(
      service.registerWithBetaInvitation(request(made.secret)),
    );
  } finally {
    db.transaction = original;
  }
  const old = (
    await q('SELECT password_hash FROM users WHERE email=$1', [email])
  ).rows[0].password_hash;
  await service.registerWithBetaInvitation({
    ...request(made.secret),
    password: 'different-password-long',
    passwordConfirm: 'different-password-long',
  });
  assert.equal((await jobs()).length, 1);
  assert.equal(
    (await q('SELECT password_hash FROM users WHERE email=$1', [email])).rows[0]
      .password_hash,
    old,
  );
});
for (const outcome of ['accepted', 'rejected', 'uncertain'])
  test(
    'closed pilot permits only invited pending dispatch, at most once: ' +
      outcome,
    async () => {
      const made = await invite();
      await service.registerWithBetaInvitation(request(made.secret));
      let calls = 0;
      const r = await dispatch.dispatchActivationMailForTest({
        env: process.env,
        http: transport(() => calls++, outcome),
      });
      assert.equal(r.classification, outcome);
      assert.equal(calls, 1);
      await dispatch.dispatchActivationMailForTest({
        env: process.env,
        http: transport(() => calls++),
      });
      assert.equal(calls, 1);
      assert.equal((await jobs())[0].state, outcome);
    },
  );
test('beta OFF and armed unfinished pilot block dispatch without spending closed-pilot budget', async () => {
  const made = await invite();
  await service.registerWithBetaInvitation(request(made.secret));
  let calls = 0;
  process.env.AUTH_BETA_INVITATION_DISPATCH_ENABLED = 'false';
  await dispatch.dispatchActivationMailForTest({
    env: process.env,
    http: transport(() => calls++),
  });
  assert.equal(calls, 0);
  assert.equal((await jobs())[0].state, 'ready');
  await assert.rejects(
    service.registerWithBetaInvitation(request(made.secret)),
    { status: 503 },
  );
});
test('revoke before committed start blocks provider and activation; existing accounts remain unchanged', async () => {
  const made = await invite();
  await service.registerWithBetaInvitation(request(made.secret));
  const token = await code();
  let calls = 0;
  await dispatch.dispatchActivationMailForTest({
    env: process.env,
    http: transport(() => calls++),
    hooks: {
      afterReservation: async () => {
        await admin.revokeBetaInvitation(actors[0], made.id);
      },
    },
  });
  assert.equal(calls, 0);
  assert.equal(
    (
      await activation.activatePendingRegistrationWithEmailToken(
        token,
        'final-beta-password',
      )
    ).ok,
    false,
  );
  assert.equal(
    (await q('SELECT email_verified_at FROM users WHERE email=$1', [email]))
      .rows[0].email_verified_at,
    null,
  );
});
test('one activation grants USER after mailbox proof; replay and later revoke cannot mutate account', async () => {
  const made = await invite();
  await service.registerWithBetaInvitation(request(made.secret));
  const token = await code();
  assert.equal(
    (
      await activation.activatePendingRegistrationWithEmailToken(
        token,
        'final-beta-password',
      )
    ).ok,
    true,
  );
  const row = (await q('SELECT * FROM users WHERE email=$1', [email])).rows[0];
  assert.ok(row.email_verified_at);
  assert.equal(row.role, 'USER');
  assert.ok(
    (
      await q(
        'SELECT activated_at FROM beta_registration_invitations WHERE id=$1',
        [made.id],
      )
    ).rows[0].activated_at,
  );
  assert.equal(
    (
      await activation.activatePendingRegistrationWithEmailToken(
        token,
        'other-beta-password',
      )
    ).ok,
    false,
  );
  await assert.rejects(admin.revokeBetaInvitation(actors[0], made.id), {
    status: 409,
  });
  assert.deepEqual(
    (await q('SELECT * FROM users WHERE email=$1', [email])).rows[0],
    row,
  );
});
test('explicit resend is rate limited; ordinary register replay never invalidates first code', async () => {
  const made = await invite();
  await service.registerWithBetaInvitation(request(made.secret));
  await service.registerWithBetaInvitation(request(made.secret));
  await service.registerWithBetaInvitation(request(made.secret, 'resend'));
  assert.equal((await jobs()).length, 1);
  await q(
    "UPDATE email_verification_tokens SET created_at=created_at-interval '61 seconds' WHERE invitation_id=$1",
    [made.id],
  );
  await service.registerWithBetaInvitation(request(made.secret, 'resend'));
  assert.equal((await jobs()).length, 2);
  assert.equal((await jobs())[0].state, 'expired');
  assert.equal((await jobs())[1].state, 'ready');
});
test('lost start commit acknowledgement never permits HTTP or retries', async () => {
  const made = await invite();
  await service.registerWithBetaInvitation(request(made.secret));
  const { db } = await import('../src/db');
  const original = db.transaction,
    bound = original.bind(db);
  db.transaction = ((...a: Parameters<typeof bound>) =>
    bound(...a).then((r) => {
      if (r && typeof r === 'object' && 'body' in r && 'startedAt' in r)
        throw Error('lost start acknowledgement');
      return r;
    })) as typeof db.transaction;
  let calls = 0;
  try {
    await dispatch.dispatchActivationMailForTest({
      env: process.env,
      http: transport(() => calls++),
    });
  } finally {
    db.transaction = original;
  }
  assert.equal(calls, 0);
  assert.ok((await jobs())[0].dispatch_started_at);
  await dispatch.dispatchActivationMailForTest({
    env: process.env,
    http: transport(() => calls++),
  });
  assert.equal(calls, 0);
});

test('old unbound issuers and token-only internal compatibility cannot bypass invitation revocation', async () => {
  const made = await invite();
  await service.registerWithBetaInvitation(request(made.secret));
  const user = (await q('SELECT id FROM users WHERE email=$1', [email])).rows[0]
    .id;
  const legacy = await import('../src/modules/auth/email-verification-service');
  assert.equal((await legacy.issueEmailVerificationForUser(user)).ok, false);
  const { enqueuePendingActivationMailForUser } = await import(
    '../src/modules/auth/registration-activation-outbox-issue'
  );
  assert.equal(
    (
      await enqueuePendingActivationMailForUser({
        userId: user,
        publicOrigin: origin,
        key: { keyId: 'beta-test', bytes: key },
      })
    ).ok,
    false,
  );
  await q(
    'UPDATE email_verification_tokens SET revoked_at=now() WHERE invitation_id=$1',
    [made.id],
  );
  const { issueEmailVerificationToken } = await import(
    '../src/modules/auth/email-verification-token'
  );
  const unbound = issueEmailVerificationToken();
  await q(
    'INSERT INTO email_verification_tokens(user_id,email_snapshot,token_hash,expires_at) VALUES($1,$2,$3,$4)',
    [user, email, unbound.tokenHash, unbound.expiresAt],
  );
  await admin.revokeBetaInvitation(actors[0], made.id);
  assert.equal(
    (
      await activation.activatePendingRegistrationWithEmailToken(
        unbound.token,
        'different-long-password',
      )
    ).ok,
    false,
  );
});
test('beta claim filters unrelated ready jobs before LIMIT and leaves them untouched', async () => {
  const { enqueuePendingActivationMailForUser } = await import(
    '../src/modules/auth/registration-activation-outbox-issue'
  );
  for (let i = 0; i < 18; i++) {
    const u = (
      await q(
        "INSERT INTO users(email,password_hash,verification_required_at) VALUES($1,'synthetic-unused',now()) RETURNING id",
        [prefix + '-ordinary-' + i + '@example.invalid'],
      )
    ).rows[0].id;
    assert.ok(
      (
        await enqueuePendingActivationMailForUser({
          userId: u,
          publicOrigin: origin,
          key: { keyId: 'beta-test', bytes: key },
        })
      ).ok,
    );
  }
  const before = (await jobs()).map((r) => ({
    id: r.id,
    state: r.state,
    claim_id: r.claim_id,
  }));
  const made = await invite();
  await service.registerWithBetaInvitation(request(made.secret));
  let calls = 0;
  await dispatch.dispatchActivationMailForTest({
    env: process.env,
    http: transport(() => calls++),
  });
  assert.equal(calls, 1);
  const after = (await jobs())
    .filter((r) => before.some((b) => b.id === r.id))
    .map((r) => ({ id: r.id, state: r.state, claim_id: r.claim_id }));
  assert.deepEqual(after, before);
});
test('expiry, immutable lifecycle, token purpose and cross-user bindings fail closed', async () => {
  const { newInvitationSecret } = await import(
    '../src/modules/auth/beta-invitation-policy'
  );
  const expired = newInvitationSecret();
  const row = (
    await q(
      "INSERT INTO beta_registration_invitations(secret_hash,email,created_by_user_id,created_at,expires_at) VALUES($1,$2,$3,now()-interval '8 days',now()-interval '1 day') RETURNING id",
      [expired.hash, email, actors[0].userId],
    )
  ).rows[0];
  assert.equal(
    (await service.inspectBetaInvitation(expired.secret)).status,
    'EXPIRED',
  );
  await assert.rejects(
    service.registerWithBetaInvitation(request(expired.secret)),
    { status: 400 },
  );
  await assert.rejects(
    q(
      "UPDATE beta_registration_invitations SET expires_at=now()+interval '1 day' WHERE id=$1",
      [row.id],
    ),
    { code: '23514' },
  );
  const made = await invite();
  await service.registerWithBetaInvitation(request(made.secret));
  const t = (
    await q('SELECT * FROM email_verification_tokens WHERE invitation_id=$1', [
      made.id,
    ])
  ).rows[0];
  await assert.rejects(
    q('UPDATE email_verification_tokens SET invitation_id=NULL WHERE id=$1', [
      t.id,
    ]),
    { code: '23514' },
  );
  await assert.rejects(
    q(
      "UPDATE email_verification_tokens SET purpose='legacy_email_verification' WHERE id=$1",
      [t.id],
    ),
    { code: '23514' },
  );
  await assert.rejects(
    q('UPDATE email_verification_tokens SET user_id=$1 WHERE id=$2', [
      actors[1].userId,
      t.id,
    ]),
    { code: '23514' },
  );
  const { issueEmailVerificationToken } = await import(
    '../src/modules/auth/email-verification-token'
  );
  const token = issueEmailVerificationToken();
  await q(
    'UPDATE beta_registration_invitations SET pending_user_id=$1,claimed_at=created_at WHERE id=$2',
    [t.user_id, row.id],
  );
  await q('UPDATE email_verification_tokens SET revoked_at=now() WHERE id=$1', [
    t.id,
  ]);
  await q(
    'INSERT INTO email_verification_tokens(user_id,email_snapshot,token_hash,expires_at,invitation_id) VALUES($1,$2,$3,$4,$5)',
    [t.user_id, email, token.tokenHash, token.expiresAt, row.id],
  );
  assert.equal(
    (
      await activation.activatePendingRegistrationWithEmailToken(
        token.token,
        'final-long-password',
      )
    ).ok,
    false,
  );
});
test('parallel workers and a post-start revoke preserve at-most-once and prevent later activation', async () => {
  const made = await invite();
  await service.registerWithBetaInvitation(request(made.secret));
  const token = await code();
  let calls = 0;
  await Promise.all(
    Array.from({ length: 5 }, () =>
      dispatch.dispatchActivationMailForTest({
        env: process.env,
        http: transport(() => calls++),
        hooks: {
          afterStart: async () => {
            await admin.revokeBetaInvitation(actors[0], made.id);
          },
        },
      }),
    ),
  );
  assert.equal(calls, 1);
  assert.equal((await jobs())[0].state, 'accepted');
  assert.equal(
    (
      await activation.activatePendingRegistrationWithEmailToken(
        token,
        'final-long-password',
      )
    ).ok,
    false,
  );
});
test('replacement invite resumes only invitation-origin pending identity and never replaces password early', async () => {
  const made = await invite();
  await service.registerWithBetaInvitation(request(made.secret));
  const old = (
    await q('SELECT id,password_hash FROM users WHERE email=$1', [email])
  ).rows[0];
  await admin.revokeBetaInvitation(actors[0], made.id);
  const replacement = await invite();
  await service.registerWithBetaInvitation({
    ...request(replacement.secret),
    password: 'replacement-password-long',
    passwordConfirm: 'replacement-password-long',
  });
  assert.deepEqual(
    (await q('SELECT id,password_hash FROM users WHERE email=$1', [email]))
      .rows[0],
    old,
  );
  assert.equal(
    (
      await q(
        'SELECT pending_user_id FROM beta_registration_invitations WHERE id=$1',
        [replacement.id],
      )
    ).rows[0].pending_user_id,
    old.id,
  );
  assert.equal(
    (await jobs()).length,
    1,
    'replacement must not bypass per-account mail cooldown',
  );
  await q(
    "UPDATE email_verification_tokens SET created_at=created_at-interval '61 seconds' WHERE user_id=$1",
    [old.id],
  );
  await service.registerWithBetaInvitation(
    request(replacement.secret, 'resend'),
  );
  assert.equal(
    (
      await activation.activatePendingRegistrationWithEmailToken(
        await code(),
        'replacement-password-long',
      )
    ).ok,
    true,
  );
});
test('invited activation and worker never elevate an account whose role was changed before verification', async () => {
  const made = await invite();
  await service.registerWithBetaInvitation(request(made.secret));
  const token = await code();
  await q("UPDATE users SET role='EDITOR' WHERE email=$1", [email]);
  let calls = 0;
  await dispatch.dispatchActivationMailForTest({
    env: process.env,
    http: transport(() => calls++),
  });
  assert.equal(calls, 0);
  assert.equal(
    (
      await activation.activatePendingRegistrationWithEmailToken(
        token,
        'final-beta-password',
      )
    ).ok,
    false,
  );
  assert.equal(
    (await q('SELECT email_verified_at FROM users WHERE email=$1', [email]))
      .rows[0].email_verified_at,
    null,
  );
});


test('runtime policy is ADMIN only, audited, revision fenced, and never alters pilot or sessions',async()=>{
 const {readSiteAccess,setSiteAccess}=await import('../src/modules/auth/site-access-service');
 const old=await readSiteAccess();
 const sessionsBefore=(await q('SELECT * FROM sessions WHERE user_id=ANY($1::int[]) ORDER BY id',[actors.map(a=>a.userId)])).rows;
 for(const actor of actors.slice(1)) await assert.rejects(setSiteAccess(actor,true,true,old.revision),(e:unknown)=>e instanceof admin.InvitationError && e.status===403);
 const changed=await setSiteAccess(actors[0],true,true,old.revision);
 assert.equal(changed.publicRegistration,true);assert.equal(changed.betaOnly,true);
 await assert.rejects(setSiteAccess(actors[0],false,false,old.revision),(e:unknown)=>e instanceof admin.InvitationError && e.status===409);
 assert.equal((await q('SELECT * FROM site_access_events WHERE actor_user_id=$1',[actors[0].userId])).rowCount,1);
 assert.deepEqual((await q('SELECT * FROM sessions WHERE user_id=ANY($1::int[]) ORDER BY id',[actors.map(a=>a.userId)])).rows,sessionsBefore);
});

test('beta invitation grants membership only at activation, not frame; ordinary invitation never grants it',async()=>{
 for(const grants of [true,false]){
   email=prefix+'-'+grants+'@example.invalid';
   const made=await admin.createBetaInvitation(actors[0],email,grants);
   await service.inspectBetaInvitation(made.secret);
   assert.equal((await q('SELECT id FROM users WHERE email=$1',[email])).rowCount,0);
   await service.registerWithBetaInvitation({intent:'request',invitation:made.secret,email});
   const user=(await q('SELECT id FROM users WHERE email=$1',[email])).rows[0];
   assert.equal((await q('SELECT * FROM user_appearance WHERE user_id=$1',[user.id])).rowCount,0);
   const token=await code();
   assert.equal((await activation.activatePendingRegistrationWithEmailToken(token,'final-membership-password')).ok,true);
   const appearance=(await q('SELECT * FROM user_appearance WHERE user_id=$1',[user.id])).rows[0];
   assert.equal(appearance?.beta_participant??false,grants);
   assert.equal(appearance?.beta_frame_granted??false,false);
   assert.equal(appearance?.selected_frame??null,null);
   assert.equal((await activation.activatePendingRegistrationWithEmailToken(token,'replay-password-long')).ok,false);
 }
});

test('membership failure rolls back mailbox proof, consumed token and invitation atomically',async()=>{
 const made=await admin.createBetaInvitation(actors[0],email,true);
 await service.registerWithBetaInvitation({intent:'request',invitation:made.secret,email});
 const token=await code();
 await q("CREATE FUNCTION qa_reject_membership() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic';END$$");
 await q('CREATE TRIGGER qa_reject_membership BEFORE INSERT ON user_appearance FOR EACH ROW EXECUTE FUNCTION qa_reject_membership()');
 try{await assert.rejects(activation.activatePendingRegistrationWithEmailToken(token,'final-membership-password'));}
 finally{await q('DROP TRIGGER qa_reject_membership ON user_appearance');await q('DROP FUNCTION qa_reject_membership()');}
 assert.equal((await q('SELECT email_verified_at FROM users WHERE email=$1',[email])).rows[0].email_verified_at,null);
 assert.equal((await q('SELECT consumed_at FROM email_verification_tokens WHERE invitation_id=$1',[made.id])).rows[0].consumed_at,null);
 assert.equal((await q('SELECT activated_at FROM beta_registration_invitations WHERE id=$1',[made.id])).rows[0].activated_at,null);
 assert.equal((await activation.activatePendingRegistrationWithEmailToken(token,'final-membership-password')).ok,true);
});

test('public email-first registration is closed by default; concurrent enabled requests use existing dispatcher and never award beta',async()=>{
 const {readSiteAccess,setSiteAccess}=await import('../src/modules/auth/site-access-service');
 const {registerPasswordUser}=await import('../src/modules/auth/registration-service');
 assert.deepEqual(await registerPasswordUser(email,null),{ok:false,kind:'registration_unavailable'});
 await setSiteAccess(actors[0],true,false,(await readSiteAccess()).revision);
 await Promise.all(Array.from({length:4},()=>registerPasswordUser(email,null)));
 assert.equal((await q('SELECT id FROM users WHERE email=$1',[email])).rowCount,1);
 assert.equal((await jobs()).length,1);
 const token=await code();let calls=0;
 const sent=await dispatch.dispatchActivationMailForTest({env:flags,http:transport(()=>calls++)});
 assert.equal(sent.status,'recorded');assert.equal(calls,1);
 const closed=await setSiteAccess(actors[0],false,false,(await readSiteAccess()).revision);
 assert.equal(closed.publicRegistration,false);
 // Previously received code can still complete after intake is closed.
 assert.equal((await activation.activatePendingRegistrationWithEmailToken(token,'final-public-password')).ok,true);
 const user=(await q('SELECT id FROM users WHERE email=$1',[email])).rows[0];
 assert.equal((await q('SELECT * FROM user_appearance WHERE user_id=$1',[user.id])).rowCount,0);
 assert.equal((await registerPasswordUser(prefix+'-closed@example.invalid',null)).ok,false);
});

test('closing public policy after reservation blocks committed send start; no HTTP, no pilot budget change',async()=>{
 const {readSiteAccess,setSiteAccess}=await import('../src/modules/auth/site-access-service');
 const {registerPasswordUser}=await import('../src/modules/auth/registration-service');
 await setSiteAccess(actors[0],true,false,(await readSiteAccess()).revision);
 await registerPasswordUser(email,null);let calls=0;
 const result=await dispatch.dispatchActivationMailForTest({env:flags,http:transport(()=>calls++),hooks:{afterReservation:async()=>{await setSiteAccess(actors[0],false,false,(await readSiteAccess()).revision);}}});
 assert.equal(result.attempted,false);assert.equal(calls,0);
 assert.equal((await jobs())[0].dispatch_started_at,null);
});
