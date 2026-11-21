import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {Pool} from 'pg';import {drizzle} from 'drizzle-orm/node-postgres';import {migrate} from 'drizzle-orm/node-postgres/migrator';import {getTableConfig} from 'drizzle-orm/pg-core';import {comics,chapters,genres,comicGenres} from '../src/db/schema';
const target=process.env.PRESENTATION_TEST_DATABASE_URL;if(!target)throw Error('explicit disposable target');const u=new URL(target);
const local=u.hostname==='127.0.0.1'&&u.port==='55576'&&u.username==='comic_diary_ci'&&u.pathname==='/comic_diary_release';const ci=process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='Flawden/comic-diary'&&u.hostname==='127.0.0.1'&&u.port==='5432'&&u.username==='comic_diary_ci'&&u.pathname==='/comic_diary_release';if(u.protocol!=='postgresql:'||(!local&&!ci)||u.search||u.hash)throw Error('REFUSED database');
test('0049 -> 0050: additive schema, exact historical data, null defaults, checks, Drizzle and replay',async()=>{
 const admin=new Pool({connectionString:target}),name='presentation_upgrade_'+randomUUID().replaceAll('-',''),folder=mkdtempSync(join(tmpdir(),'presentation-upgrade-'));let pool:Pool|undefined,created=false;
 try{
  assert.equal((await admin.query("SELECT current_setting('server_version_num')::int/10000 n")).rows[0].n,17);
  await admin.query(`CREATE DATABASE "${name}"`);created=true;const child=new URL(target);child.pathname='/'+name;pool=new Pool({connectionString:child.href});const db=drizzle(pool);
  const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));const base={...journal,entries:journal.entries.filter((e:{idx:number})=>e.idx<=49)};
  mkdirSync(join(folder,'meta'));writeFileSync(join(folder,'meta/_journal.json'),JSON.stringify(base));for(const e of base.entries)copyFileSync('drizzle/'+e.tag+'.sql',join(folder,e.tag+'.sql'));await migrate(db,{migrationsFolder:folder});
  const user=(await pool.query("INSERT INTO users(email,password_hash) VALUES('schema@example.invalid','synthetic-preserved') RETURNING id")).rows[0].id;
  const book=(await pool.query("INSERT INTO comics(slug,title) VALUES('schema-presentation','Historical work') RETURNING id")).rows[0].id;
  const chapter=(await pool.query("INSERT INTO chapters(comic_id,display_code,sort_order,status) VALUES($1,'1',1,'RELEASED') RETURNING id",[book])).rows[0].id;
  await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,repeat('a',64),now()+interval '1 hour')",[user]);
  await pool.query("INSERT INTO user_comics(user_id,comic_id,rating_plot,personal_note) VALUES($1,$2,4,'PRIVATE_PRESERVED')",[user,book]);
  await pool.query('INSERT INTO user_chapter_reads(user_id,chapter_id,rating) VALUES($1,$2,3)',[user,chapter]);
  await pool.query("UPDATE activation_mail_dispatch_control SET pilot_id=$1,pilot_user_id=1,pilot_outbox_id=1,pilot_armed_at=now(),pilot_dispatch_used_at=now(),pilot_closed_at=now(),generation=2 WHERE id=1",[randomUUID()]);
  const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(x=>x.tablename as string);
  const snapshot=()=>Promise.all(tables.map(async t=>{const removed=t==='comics'?['age_rating','presentation_revision']:t==='chapters'?['page_count','reading_minutes']:[];return (await pool!.query(`SELECT coalesce(jsonb_agg(to_jsonb(t)-$1::text[] ORDER BY (to_jsonb(t)-$1::text[])::text),'[]') v FROM "${t}" t`,[removed])).rows[0].v;}));
  const before=await snapshot(),prior=(await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
  const targetJournal={...journal,entries:journal.entries.filter((e:{idx:number})=>e.idx<=50)};writeFileSync(join(folder,'meta/_journal.json'),JSON.stringify(targetJournal));copyFileSync('drizzle/'+targetJournal.entries.at(-1).tag+'.sql',join(folder,targetJournal.entries.at(-1).tag+'.sql'));
  await migrate(db,{migrationsFolder:folder});const after=(await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
  assert.equal(prior.length,50);assert.equal(after.length,51);assert.deepEqual(after.slice(0,50),prior);assert.deepEqual(await snapshot(),before);
  assert.deepEqual((await pool.query('SELECT age_rating,presentation_revision FROM comics WHERE id=$1',[book])).rows[0],{age_rating:null,presentation_revision:0});
  assert.deepEqual((await pool.query('SELECT page_count,reading_minutes FROM chapters WHERE id=$1',[chapter])).rows[0],{page_count:null,reading_minutes:null});
  for(const [field,value] of [['page_count',0],['page_count',100001],['reading_minutes',-1]])await assert.rejects(pool.query(`UPDATE chapters SET ${field}=$1 WHERE id=$2`,[value,chapter]),{code:'23514'});
  await assert.rejects(pool.query('UPDATE comics SET age_rating=7 WHERE id=$1',[book]),{code:'23514'});
  await pool.query('UPDATE chapters SET page_count=24,reading_minutes=3 WHERE id=$1',[chapter]);
  await migrate(db,{migrationsFolder:folder});assert.deepEqual((await pool.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY id')).rows,after);assert.deepEqual(await snapshot(),before);
  assert.equal((await pool.query('SELECT page_count FROM chapters WHERE id=$1',[chapter])).rows[0].page_count,24);
  for(const table of [comics,chapters,genres,comicGenres]){const config=getTableConfig(table);const columns=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",[config.name])).rows.map(x=>x.column_name).sort();assert.deepEqual(columns,config.columns.map(x=>x.name).sort());}
 }finally{await pool?.end();if(created)await admin.query(`DROP DATABASE "${name}"`);await admin.end();rmSync(folder,{recursive:true});}
});
