import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  betaInvitations,
  betaInvitationEvents,
  emailVerificationTokens,
} from '../src/db/schema';
const target = process.env.BETA_TEST_DATABASE_URL;
if (!target) throw Error('Explicit disposable target');
const u = new URL(target);
const local =
  u.hostname === '127.0.0.1' &&
  u.port === '55588' &&
  u.username === 'beta01_qa' &&
  u.pathname === '/beta01_review';
const ci =
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_REPOSITORY === 'Flawden/comic-diary' &&
  u.hostname === '127.0.0.1' &&
  u.port === '5432' &&
  u.username === 'comic_diary_ci' &&
  u.pathname === '/comic_diary_release';
if (!local && !ci) throw Error('Refused database');
test('0050 -> 0051 additive upgrade preserves all old rows, old inserts, closed pilot, hashes and replay', async () => {
  const owner = new Pool({ connectionString: target }),
    name = 'beta_upgrade_' + randomUUID().replaceAll('-', ''),
    folder = mkdtempSync(join(tmpdir(), 'beta-upgrade-'));
  let pool: Pool | undefined,
    created = false;
  try {
    assert.equal(
      (
        await owner.query(
          "SELECT current_setting('server_version_num')::int/10000 n",
        )
      ).rows[0].n,
      17,
    );
    await owner.query(`CREATE DATABASE "${name}"`);
    created = true;
    const child = new URL(target);
    child.pathname = '/' + name;
    pool = new Pool({ connectionString: child.href });
    const db = drizzle(pool);
    const journal = JSON.parse(
      readFileSync('drizzle/meta/_journal.json', 'utf8'),
    );
    const base = {
      ...journal,
      entries: journal.entries.filter((e: { idx: number }) => e.idx <= 50),
    };
    mkdirSync(join(folder, 'meta'));
    writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify(base));
    for (const e of base.entries)
      copyFileSync('drizzle/' + e.tag + '.sql', join(folder, e.tag + '.sql'));
    await migrate(db, { migrationsFolder: folder });
    const id = (
      await pool.query(
        "INSERT INTO users(email,password_hash,role) VALUES('upgrade@example.invalid','synthetic-preserved','ADMIN') RETURNING id",
      )
    ).rows[0].id;
    await pool.query(
      "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,repeat('a',64),now()+interval '1 hour')",
      [id],
    );
    await pool.query(
      "INSERT INTO email_verification_tokens(user_id,email_snapshot,token_hash,expires_at) VALUES($1,'upgrade@example.invalid',repeat('b',64),now()+interval '30 minutes')",
      [id],
    );
    await pool.query(
      'UPDATE activation_mail_dispatch_control SET pilot_id=$1,pilot_user_id=1,pilot_outbox_id=1,pilot_armed_at=now(),pilot_dispatch_used_at=now(),pilot_closed_at=now(),generation=2 WHERE id=1',
      [randomUUID()],
    );
    const tables = (
      await pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows.map((r) => r.tablename as string);
    const snapshot = () =>
      Promise.all(
        tables.map(
          async (t) =>
            (
              await pool!.query(
                `SELECT coalesce(jsonb_agg(to_jsonb(t)-$1::text[] ORDER BY (to_jsonb(t)-$1::text[])::text),'[]') v FROM "${t}" t`,
                [t === 'email_verification_tokens' ? ['invitation_id'] : []],
              )
            ).rows[0].v,
        ),
      );
    const before = await snapshot(),
      old = (
        await pool.query(
          'SELECT * FROM drizzle.__drizzle_migrations ORDER BY id',
        )
      ).rows;
    await migrate(db, { migrationsFolder: 'drizzle' });
    const current = (
      await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')
    ).rows;
    assert.equal(old.length, 51);
    assert.equal(current.length, 53);
    assert.deepEqual(current.slice(0, 51), old);
    assert.deepEqual(await snapshot(), before);
    assert.equal(
      (await pool.query('SELECT invitation_id FROM email_verification_tokens'))
        .rows[0].invitation_id,
      null,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int n FROM pg_trigger WHERE tgname IN ('beta_invitation_write_once','beta_invitation_token_binding') AND NOT tgisinternal AND tgenabled<>'D'",
        )
      ).rows[0].n,
      2,
    );
    const token = (
      await pool.query('SELECT id FROM email_verification_tokens LIMIT 1')
    ).rows[0].id;
    await assert.rejects(
      pool.query(
        'UPDATE email_verification_tokens SET invitation_id=987654 WHERE id=$1',
        [token],
      ),
      { code: '23514' },
    );
    await pool.query(
      "INSERT INTO email_verification_tokens(user_id,email_snapshot,token_hash,expires_at,revoked_at) VALUES($1,'upgrade@example.invalid',repeat('c',64),now()+interval '30 minutes',now())",
      [id],
    );
    await migrate(db, { migrationsFolder: 'drizzle' });
    assert.deepEqual(
      (
        await pool.query(
          'SELECT * FROM drizzle.__drizzle_migrations ORDER BY id',
        )
      ).rows,
      current,
    );
    for (const table of [
      betaInvitations,
      betaInvitationEvents,
      emailVerificationTokens,
    ]) {
      const c = getTableConfig(table);
      const actual = (
        await pool.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
          [c.name],
        )
      ).rows
        .map((x) => x.column_name)
        .sort();
      assert.deepEqual(actual, c.columns.map((x) => x.name).sort());
    }
  } finally {
    await pool?.end();
    if (created) await owner.query(`DROP DATABASE "${name}"`);
    await owner.end();
    rmSync(folder, { recursive: true });
  }
});
