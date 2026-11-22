import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Pool} from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
const target=process.env.LIFECYCLE_TEST_DATABASE_URL??'',u=new URL(target);
const local=u.hostname==='127.0.0.1'&&u.port==='55727'&&u.username==='lifecycle_qa'&&u.pathname==='/lifecycle_review';
const ci=process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='Flawden/comic-diary'&&u.hostname==='127.0.0.1'&&u.port==='5432'&&u.username==='comic_diary_ci'&&u.pathname==='/comic_diary_release';
if(u.protocol!=='postgresql:'||(!local&&!ci)||u.search||u.hash)throw Error('Explicit disposable database required');
test('0053 -> 0054 preserves users, sessions, discussions, controls and history; old-image SQL and repeat migrate compatible',async()=>{
 const root=new Pool({connectionString:target}),name='lifecycle_upgrade_'+randomUUID().replaceAll('-',''),folder=mkdtempSync(join(tmpdir(),'lifecycle-upgrade-'));
 let pool:Pool|undefined;
 try{
  await root.query('CREATE DATABASE "'+name+'"');const child=new URL(target);child.pathname='/'+name;pool=new Pool({connectionString:child.href});const db=drizzle(pool);
  const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8')),base={...journal,entries:journal.entries.filter((e:{idx:number})=>e.idx<=53)};
  mkdirSync(join(folder,'meta'));writeFileSync(join(folder,'meta/_journal.json'),JSON.stringify(base));for(const e of base.entries)copyFileSync('drizzle/'+e.tag+'.sql',join(folder,e.tag+'.sql'));
  await migrate(db,{migrationsFolder:folder});
  const id=(await pool.query("INSERT INTO users(email,password_hash,role,verification_required_at) VALUES('legacy@example.invalid','synthetic-hash','ADMIN',null) RETURNING id")).rows[0].id;
  await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,repeat('a',64),now()+interval '1 hour')",[id]);
  await pool.query("INSERT INTO user_appearance(user_id,beta_participant) VALUES($1,true)",[id]);
  // Real closed pilot shape: its write-once values must remain byte-for-byte intact.
  await pool.query("UPDATE activation_mail_dispatch_control SET enabled=true,generation=3,pilot_id=$1,pilot_user_id=1,pilot_outbox_id=1,pilot_armed_at=now()-interval '3 hour',pilot_dispatch_used_at=now()-interval '2 hour',pilot_closed_at=now()-interval '1 hour'",[randomUUID()]);
  const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
  const snapshot=async()=>{const rows:unknown[]=[];for(const t of tables)rows.push((await pool!.query(`SELECT coalesce(jsonb_agg(to_jsonb(t)-$1::text[] ORDER BY (to_jsonb(t)-$1::text[])::text),'[]') v FROM "${t}" t`,[t==='users'?['deleted_at']:[]])).rows[0].v);return rows;};
  const before=await snapshot(),old=(await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
  await migrate(db,{migrationsFolder:'drizzle'});const after=(await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
  assert.equal(old.length,54);assert.equal(after.length,55);assert.deepEqual(after.slice(0,54),old);assert.deepEqual(await snapshot(),before);
  after.forEach((r,i)=>assert.equal(r.hash,createHash('sha256').update(readFileSync('drizzle/'+journal.entries[i].tag+'.sql')).digest('hex')));
  assert.equal((await pool.query('SELECT deleted_at FROM users WHERE id=$1',[id])).rows[0].deleted_at,null);
  await pool.query("INSERT INTO users(email,password_hash) VALUES('old-image-insert@example.invalid','synthetic-hash')");
  assert.equal((await pool.query('SELECT is_active,role FROM users WHERE id=$1',[id])).rows[0].is_active,true);
  await migrate(db,{migrationsFolder:'drizzle'});assert.deepEqual((await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows,after);
 }finally{await pool?.end();await root.query('DROP DATABASE IF EXISTS "'+name+'"');await root.end();rmSync(folder,{recursive:true,force:true});}
});
