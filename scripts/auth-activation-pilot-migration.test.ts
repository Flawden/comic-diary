/** Isolated upgrade from exact 0047 lineage; never loads dotenv. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { activationMailDispatchControl } from '../src/db/schema';
const target = process.env.PILOT_TEST_DATABASE_URL;
if (!target) throw Error('Explicit disposable target required');
const url = new URL(target);
const local = url.hostname==='127.0.0.1' && url.port==='55526' && url.username==='purpose01_qa' && url.pathname==='/purpose01_review';
const ci = process.env.GITHUB_ACTIONS==='true' && process.env.GITHUB_REPOSITORY==='Flawden/comic-diary' && url.hostname==='127.0.0.1' && url.port==='5432' && url.username==='comic_diary_ci' && url.pathname==='/comic_diary_release';
if (url.protocol!=='postgresql:' || (!local&&!ci) || url.search || url.hash) throw Error('Refused target');
test('PG17 0047 -> 0048 preserves legacy rows, old SQL, migration replay and schema', async () => {
 const admin=new Pool({connectionString:target});const name='pilot_upgrade_'+randomUUID().replaceAll('-','');
 const folder=mkdtempSync(join(tmpdir(),'pilot-upgrade-'));let pool:Pool|undefined;let created=false;
 try {
  assert.equal((await admin.query("SELECT current_setting('server_version_num')::int/10000 major")).rows[0].major,17);
  await admin.query(`CREATE DATABASE "${name}"`);created=true;
  const child=new URL(target!);child.pathname='/'+name;pool=new Pool({connectionString:child.toString()});const db=drizzle(pool);
  const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
  const baseline={...journal,entries:journal.entries.filter((e:{idx:number})=>e.idx<=47)};
  mkdirSync(join(folder,'meta'));writeFileSync(join(folder,'meta/_journal.json'),JSON.stringify(baseline));
  for(const e of baseline.entries)copyFileSync('drizzle/'+e.tag+'.sql',join(folder,e.tag+'.sql'));
  await migrate(db,{migrationsFolder:folder});
  await pool.query("INSERT INTO users(email,password_hash) VALUES('upgrade@example.invalid','synthetic')");
  await pool.query('UPDATE activation_mail_dispatch_control SET generation=6,enabled=false WHERE id=1');
  const users=(await pool.query('SELECT * FROM users')).rows;
  const before=(await pool.query('SELECT * FROM activation_mail_dispatch_control')).rows[0];
  const priorJournal=(await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
  await migrate(db,{migrationsFolder:'drizzle'});
  const applied=(await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
  assert.deepEqual(applied.slice(0,48),priorJournal);assert.equal(applied.length,49);
  await migrate(db,{migrationsFolder:'drizzle'});
  assert.deepEqual((await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows,applied);
  assert.deepEqual((await pool.query('SELECT * FROM users')).rows,users);
  const current=(await pool.query('SELECT * FROM activation_mail_dispatch_control')).rows[0];
  for(const [key,value] of Object.entries(before))assert.deepEqual(current[key],value);
  for(const [key,value] of Object.entries(current))if(key.startsWith('pilot_'))assert.equal(value,null);
  // Old application gate UPDATE remains compatible before and after arming.
  await pool.query('UPDATE activation_mail_dispatch_control SET enabled=true,generation=generation+1 WHERE id=1');
  await assert.rejects(pool.query('UPDATE activation_mail_dispatch_control SET pilot_user_id=2 WHERE id=1'),{code:'23514'});
  await pool.query('UPDATE activation_mail_dispatch_control SET pilot_id=$1,pilot_user_id=1,pilot_armed_at=clock_timestamp() WHERE id=1',[randomUUID()]);
  await pool.query('UPDATE activation_mail_dispatch_control SET enabled=false,generation=generation+1 WHERE id=1');
  await assert.rejects(pool.query('UPDATE activation_mail_dispatch_control SET pilot_id=NULL,pilot_user_id=NULL,pilot_armed_at=NULL WHERE id=1'),{code:'23514'});
  const columns=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='activation_mail_dispatch_control'")).rows.map(x=>x.column_name).sort();
  assert.deepEqual(columns,getTableConfig(activationMailDispatchControl).columns.map(x=>x.name).sort());
  assert.equal((await pool.query("SELECT count(*)::int n FROM pg_trigger WHERE tgname='auth_activation_pilot_write_once' AND NOT tgisinternal")).rows[0].n,1);
 } finally {await pool?.end();if(created)await admin.query(`DROP DATABASE "${name}"`);await admin.end();rmSync(folder,{recursive:true});}
});
