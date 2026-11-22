import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
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
import { userAppearance, appearanceEvents } from '../src/db/schema';
const target = process.env.APPEARANCE_TEST_DATABASE_URL;
if (!target) throw Error('Explicit disposable target required');
const u = new URL(target),
  local =
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
  throw Error('Refused database');
test('0051 -> 0052: additive tables, every historical hash and row preserved, old inserts and replay compatible', async () => {
  const root = new Pool({ connectionString: target }),
    name = 'appearance_upgrade_' + randomUUID().replaceAll('-', ''),
    folder = mkdtempSync(join(tmpdir(), 'appearance-upgrade-'));
  let pool: Pool | undefined,
    created = false;
  try {
    assert.equal(
      (
        await root.query(
          "SELECT current_setting('server_version_num')::int/10000 n",
        )
      ).rows[0].n,
      17,
    );
    await root.query('CREATE DATABASE "' + name + '"');
    created = true;
    const child = new URL(target);
    child.pathname = '/' + name;
    pool = new Pool({ connectionString: child.href });
    const db = drizzle(pool);
    const journal = JSON.parse(
        readFileSync('drizzle/meta/_journal.json', 'utf8'),
      ),
      base = {
        ...journal,
        entries: journal.entries.filter((e: { idx: number }) => e.idx <= 51),
      };
    mkdirSync(join(folder, 'meta'));
    writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify(base));
    for (const e of base.entries)
      copyFileSync('drizzle/' + e.tag + '.sql', join(folder, e.tag + '.sql'));
    await migrate(db, { migrationsFolder: folder });
    const id = (
      await pool.query(
        "INSERT INTO users(email,password_hash,role,email_verified_at) VALUES('migration@example.invalid','synthetic-password-hash','USER',now()) RETURNING id",
      )
    ).rows[0].id;
    await pool.query(
      "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,repeat('c',64),now()+interval '1 hour')",
      [id],
    );
    const tables = (
      await pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows.map((r) => r.tablename);
    const snapshot = async () => {
      const result: Record<string, unknown> = {};
      for (const table of tables)
        result[table] = (
          await pool!.query(
            'SELECT row_to_json(t) r FROM "' +
              table +
              '" t ORDER BY row_to_json(t)::text',
          )
        ).rows;
      return result;
    };
    const before = await snapshot(),
      old = (
        await pool.query(
          'SELECT * FROM drizzle.__drizzle_migrations ORDER BY id',
        )
      ).rows;
    const targetJournal = {...journal, entries: journal.entries.filter((e: {idx:number}) => e.idx <= 53)};
    writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify(targetJournal));
    for (const e of targetJournal.entries) copyFileSync('drizzle/' + e.tag + '.sql', join(folder, e.tag + '.sql'));
    await migrate(db, { migrationsFolder: folder });
    const after = (
      await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')
    ).rows;
    assert.equal(old.length, 52);
    assert.equal(after.length, 54);
    assert.deepEqual(after.slice(0, 52), old);
    assert.deepEqual(await snapshot(), before);
    after.forEach((r, i) =>
      assert.equal(
        r.hash,
        createHash('sha256')
          .update(readFileSync('drizzle/' + journal.entries[i].tag + '.sql'))
          .digest('hex'),
      ),
    );
    assert.equal(
      (await pool.query('SELECT count(*)::int n FROM user_appearance')).rows[0]
        .n,
      0,
    );
    assert.equal(
      (await pool.query('SELECT count(*)::int n FROM user_appearance_events'))
        .rows[0].n,
      0,
    );
    await pool.query(
      "INSERT INTO users(email,password_hash) VALUES('old-insert@example.invalid','unchanged-synthetic')",
    );
    await migrate(db, { migrationsFolder: folder });
    assert.deepEqual(
      (
        await pool.query(
          'SELECT * FROM drizzle.__drizzle_migrations ORDER BY id',
        )
      ).rows,
      after,
    );
    for (const table of [userAppearance, appearanceEvents]) {
      const config = getTableConfig(table);
      assert.deepEqual(
        (
          await pool.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY column_name",
            [config.name],
          )
        ).rows.map((r) => r.column_name),
        config.columns.map((c) => c.name).sort(),
      );
    }
  } finally {
    await pool?.end();
    if (created) await root.query('DROP DATABASE "' + name + '"');
    await root.end();
    rmSync(folder, { recursive: true });
  }
});
