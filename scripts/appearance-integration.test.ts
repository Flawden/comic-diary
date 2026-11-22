/** Explicit isolated PostgreSQL 17. Synthetic accounts only; provider HTTP forbidden. */
import assert from 'node:assert/strict';
import { test, before, beforeEach, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
const target = process.env.APPEARANCE_TEST_DATABASE_URL;
if (!target) throw Error('Explicit disposable target required');
const u = new URL(target);
const local =
  u.hostname === '127.0.0.1' &&
  u.port === '55725' &&
  u.username === 'appearance_qa' &&
  u.pathname === '/appearance_review';
const ci =
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_REPOSITORY === 'Flawden/comic-diary' &&
  u.hostname === '127.0.0.1' &&
  u.port === '5432' &&
  u.username === 'comic_diary_ci' &&
  u.pathname === '/comic_diary_release';
if (u.protocol !== 'postgresql:' || (!local && !ci) || u.search || u.hash)
  throw Error('Refused target');
Object.assign(process.env, { DATABASE_URL: target, NODE_ENV: 'test' });
const pool = new Pool({ connectionString: target }),
  q = (s: string, v: unknown[] = []) => pool.query(s, v);
let api: typeof import('../src/modules/appearance/service');
type Actor = { userId: number; sessionId: number };
let actors: Actor[] = [];
const native = globalThis.fetch;
const prefix = 'appearance-' + randomUUID();
before(async () => {
  assert.equal(
    (await q("SELECT current_setting('server_version_num')::int/10000 n"))
      .rows[0].n,
    17,
  );
  globalThis.fetch = async () => {
    throw Error('Provider forbidden');
  };
  api = await import('../src/modules/appearance/service');
});
beforeEach(async () => {
  actors = [];
  for (const role of ['ADMIN', 'EDITOR', 'USER', 'USER']) {
    const id = (
      await q(
        "INSERT INTO users(email,password_hash,role,email_verified_at) VALUES($1,'synthetic-unused',$2,now()) RETURNING id",
        [prefix + '-' + randomUUID() + '@example.invalid', role],
      )
    ).rows[0].id;
    const sessionId = (
      await q(
        "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour') RETURNING id",
        [id, randomUUID().replaceAll('-', '').padEnd(64, '0')],
      )
    ).rows[0].id;
    actors.push({ userId: id, sessionId });
  }
});
after(async () => {
  await q('DELETE FROM users WHERE email LIKE $1', [prefix + '%']);
  await pool.end();
  const { db } = await import('../src/db');
  await db.$client.end();
  globalThis.fetch = native;
});
test('new accounts and invite-independent existing users default to no avatar, no frame and no beta award', async () => {
  for (const actor of actors) {
    const a = await api.ownAppearance(actor.userId);
    assert.equal(a.revision, 0);
    assert.equal(a.avatarUrl, null);
    assert.equal(a.selectedFrame, null);
    assert.equal(a.betaParticipant, false);
    assert.equal(a.betaFrameGranted, false);
  }
});
test('USER and EDITOR cannot grant membership/frames, including themselves', async () => {
  for (const actor of actors.slice(1))
    await assert.rejects(
      api.setBetaAccess(actor, actor.userId, true, true, 0),
      { status: 403 },
    );
  assert.equal(
    (
      await q(
        'SELECT count(*)::int n FROM user_appearance WHERE user_id=ANY($1)',
        [actors.map((a) => a.userId)],
      )
    ).rows[0].n,
    0,
  );
});
test('ADMIN marks existing participant, grants frame without selecting it, USER chooses and disables it', async () => {
  let a = await api.setBetaAccess(actors[0], actors[2].userId, true, false, 0);
  assert.equal(a.selectedFrame, null);
  await assert.rejects(
    api.selectOwnFrame(actors[2], 'beta_dragon_2026', a.revision),
    { status: 403 },
  );
  a = await api.setBetaAccess(
    actors[0],
    actors[2].userId,
    true,
    true,
    a.revision,
  );
  assert.equal(a.selectedFrame, null);
  a = await api.selectOwnFrame(actors[2], 'beta_dragon_2026', a.revision);
  assert.ok(a.frameUrl);
  a = await api.selectOwnFrame(actors[2], null, a.revision);
  assert.equal(a.frameUrl, null);
  assert.equal(a.betaFrameGranted, true);
  const events = await q(
    'SELECT * FROM user_appearance_events WHERE target_user_id=$1',
    [actors[2].userId],
  );
  assert.equal(events.rowCount, 2);
});
test('outsiders and future accounts cannot select exclusive frame even with known frame URL/key', async () => {
  await api.setBetaAccess(actors[0], actors[2].userId, true, true, 0);
  await assert.rejects(api.selectOwnFrame(actors[3], 'beta_dragon_2026', 0), {
    status: 403,
  });
  await assert.rejects(
    api.selectOwnFrame(actors[3], '/avatar-frames/beta-dragon-2026.png', 0),
    { status: 400 },
  );
  assert.equal(
    (await api.ownAppearance(actors[3].userId)).betaFrameGranted,
    false,
  );
});
test('revocation clears selection; regrant never silently selects; public DTO stops showing award', async () => {
  let a = await api.setBetaAccess(actors[0], actors[2].userId, true, true, 0);
  a = await api.selectOwnFrame(actors[2], 'beta_dragon_2026', a.revision);
  a = await api.setBetaAccess(
    actors[0],
    actors[2].userId,
    false,
    false,
    a.revision,
  );
  assert.equal(a.selectedFrame, null);
  assert.equal(
    (await api.getPublicAppearances([actors[2].userId])).get(actors[2].userId)
      ?.frameUrl,
    null,
  );
  await assert.rejects(
    api.selectOwnFrame(actors[2], 'beta_dragon_2026', a.revision),
    { status: 403 },
  );
  a = await api.setBetaAccess(
    actors[0],
    actors[2].userId,
    true,
    true,
    a.revision,
  );
  assert.equal(a.selectedFrame, null);
});
test('parallel frame selection and revocation serialize without restoring revoked access', async () => {
  const a = await api.setBetaAccess(actors[0], actors[2].userId, true, true, 0);
  const results = await Promise.allSettled([
    api.selectOwnFrame(actors[2], 'beta_dragon_2026', a.revision),
    api.setBetaAccess(actors[0], actors[2].userId, false, false, a.revision),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  const current = await api.ownAppearance(actors[2].userId);
  await api.setBetaAccess(
    actors[0],
    actors[2].userId,
    false,
    false,
    current.revision,
  );
  assert.equal((await api.ownAppearance(actors[2].userId)).selectedFrame, null);
});
test('parallel uploads and replay have optimistic conflict; another account stays byte-for-byte unchanged', async () => {
  const before = (
    await q(
      'SELECT id,role,is_active,display_name,email_verified_at,updated_at FROM users WHERE id=ANY($1)',
      [actors.map((a) => a.userId)],
    )
  ).rows;
  const names = [randomUUID() + '.webp', randomUUID() + '.webp'];
  const results = await Promise.allSettled(
    names.map((n) => api.setOwnAvatar(actors[2], n, 0)),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  await assert.rejects(api.setOwnAvatar(actors[2], names[0], 0), {
    status: 409,
  });
  const a = await api.ownAppearance(actors[2].userId);
  await api.setOwnAvatar(actors[2], null, a.revision);
  assert.equal((await api.ownAppearance(actors[2].userId)).avatarUrl, null);
  assert.deepEqual(
    (
      await q(
        'SELECT id,role,is_active,display_name,email_verified_at,updated_at FROM users WHERE id=ANY($1)',
        [actors.map((a) => a.userId)],
      )
    ).rows,
    before,
  );
  assert.equal((await api.ownAppearance(actors[3].userId)).revision, 0);
});
test('expired/revoked sessions, downgraded ADMIN and pending identities fail revalidation', async () => {
  await q('DELETE FROM sessions WHERE id=$1', [actors[2].sessionId]);
  await assert.rejects(api.setOwnAvatar(actors[2], null, 0), { status: 401 });
  await q("UPDATE users SET role='USER' WHERE id=$1", [actors[0].userId]);
  await assert.rejects(
    api.setBetaAccess(actors[0], actors[3].userId, true, true, 0),
    { status: 403 },
  );
  await q(
    'UPDATE users SET email_verified_at=NULL,verification_required_at=now() WHERE id=$1',
    [actors[3].userId],
  );
  await assert.rejects(api.selectOwnFrame(actors[3], null, 0), { status: 401 });
});
test('database constraints forbid grant to nonparticipant and selection without grant; failures leave no row', async () => {
  await assert.rejects(
    q(
      'INSERT INTO user_appearance(user_id,beta_frame_granted) VALUES($1,true)',
      [actors[2].userId],
    ),
  );
  await assert.rejects(
    q(
      "INSERT INTO user_appearance(user_id,selected_frame) VALUES($1,'beta_dragon_2026')",
      [actors[2].userId],
    ),
  );
  await assert.rejects(
    api.setBetaAccess(actors[0], actors[2].userId, false, true, 0),
    { status: 400 },
  );
  assert.equal((await api.ownAppearance(actors[2].userId)).revision, 0);
});
test('invalid filenames cannot expose arbitrary media; inactive authors have no public appearance', async () => {
  await assert.rejects(api.setOwnAvatar(actors[2], '../../secret.webp', 0), {
    status: 400,
  });
  await api.setOwnAvatar(actors[2], randomUUID() + '.webp', 0);
  await q('UPDATE users SET is_active=false WHERE id=$1', [actors[2].userId]);
  assert.deepEqual(
    (await api.getPublicAppearances([actors[2].userId])).get(actors[2].userId),
    { avatarUrl: null, frameUrl: null },
  );
});

test('audit failure rolls back membership and grant atomically', async () => {
  const name = 'appearance_fault_' + randomUUID().replaceAll('-', '');
  await q(
    `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_user_id=${actors[2].userId} THEN RAISE EXCEPTION 'synthetic audit fault'; END IF; RETURN NEW; END $$`,
  );
  await q(
    `CREATE TRIGGER ${name} BEFORE INSERT ON user_appearance_events FOR EACH ROW EXECUTE FUNCTION ${name}()`,
  );
  try {
    await assert.rejects(
      api.setBetaAccess(actors[0], actors[2].userId, true, true, 0),
    );
    assert.equal((await api.ownAppearance(actors[2].userId)).revision, 0);
    assert.equal(
      (
        await q(
          'SELECT count(*)::int n FROM user_appearance_events WHERE target_user_id=$1',
          [actors[2].userId],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await q(`DROP TRIGGER ${name} ON user_appearance_events`);
    await q(`DROP FUNCTION ${name}()`);
  }
});

test('appearance writes preserve AUTH gates, pilot, existing sessions and invitation state', async () => {
  const snapshot = async () => ({
    activation: (await q('SELECT * FROM activation_mail_dispatch_control'))
      .rows,
    recovery: (await q('SELECT * FROM password_reset_mail_dispatch_control'))
      .rows,
    invites: (
      await q(
        'SELECT id,pending_user_id,claimed_at,activated_at,revoked_at FROM beta_registration_invitations ORDER BY id',
      )
    ).rows,
    sessions: (
      await q(
        'SELECT id,user_id,expires_at FROM sessions WHERE user_id=ANY($1) ORDER BY id',
        [actors.map((a) => a.userId)],
      )
    ).rows,
  });
  const before = await snapshot();
  let a = await api.setBetaAccess(actors[0], actors[2].userId, true, true, 0);
  a = await api.selectOwnFrame(actors[2], 'beta_dragon_2026', a.revision);
  await api.setOwnAvatar(actors[2], randomUUID() + '.webp', a.revision);
  assert.deepEqual(await snapshot(), before);
});
