/** Disposable PG17 + synthetic users only; all provider HTTP is blocked. */
import assert from 'node:assert/strict';import {randomUUID,randomBytes,createHash} from 'node:crypto';import {before,beforeEach,after,afterEach,test} from 'node:test';import {Pool} from 'pg';
const target=process.env.PRESENTATION_TEST_DATABASE_URL;if(!target)throw Error('explicit disposable target');const u=new URL(target);
const local=u.hostname==='127.0.0.1'&&u.port==='55576'&&u.username==='comic_diary_ci'&&u.pathname==='/comic_diary_release';
const ci=process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='Flawden/comic-diary'&&u.hostname==='127.0.0.1'&&u.port==='5432'&&u.username==='comic_diary_ci'&&u.pathname==='/comic_diary_release';
if(u.protocol!=='postgresql:'||(!local&&!ci)||u.search||u.hash)throw Error('REFUSED database');process.env.DATABASE_URL=target;
const pool=new Pool({connectionString:target});const q=(s:string,v:unknown[]=[])=>pool.query(s,v);const native=globalThis.fetch;
let service:typeof import('../src/modules/catalog/work-presentation-service'),ratings:typeof import('../src/modules/library/queries/get-community-ratings');
let book:number,other:number,ids:number[],actors:{userId:number;sessionId:number}[];
before(async()=>{assert.equal((await q("SELECT current_setting('server_version_num')::int/10000 n")).rows[0].n,17);globalThis.fetch=async()=>{throw Error('PROVIDER HTTP FORBIDDEN');};service=await import('../src/modules/catalog/work-presentation-service');ratings=await import('../src/modules/library/queries/get-community-ratings');});
beforeEach(async()=>{actors=[];ids=[];
 for(const role of ['ADMIN','EDITOR','USER']){const user=(await q("INSERT INTO users(email,password_hash,email_verified_at,role) VALUES($1,'synthetic-unused',now(),$2) RETURNING id",[randomUUID()+'@example.invalid',role])).rows[0].id;const session=(await q("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour') RETURNING id",[user,createHash('sha256').update(randomBytes(32)).digest('hex')])).rows[0].id;actors.push({userId:user,sessionId:session});}
 book=(await q("INSERT INTO comics(slug,title) VALUES($1,'Presentation QA') RETURNING id",[randomUUID()])).rows[0].id;
 other=(await q("INSERT INTO comics(slug,title) VALUES($1,'Other work') RETURNING id",[randomUUID()])).rows[0].id;
 for(let i=0;i<3;i++)ids.push((await q("INSERT INTO chapters(comic_id,display_code,sort_order,status,volume_number) VALUES($1,$2,$3,'RELEASED',1) RETURNING id",[i===2?other:book,String(i+1),i])).rows[0].id);
});
afterEach(async()=>{await q('DELETE FROM user_chapter_reads WHERE user_id=ANY($1::int[])',[actors.map(a=>a.userId)]);await q('DELETE FROM administrative_audit_events WHERE actor_user_id=ANY($1::int[])',[actors.map(a=>a.userId)]);await q('DELETE FROM comics WHERE id=ANY($1::int[])',[[book,other]]);await q('DELETE FROM users WHERE id=ANY($1::int[])',[actors.map(a=>a.userId)]);});
after(async()=>{globalThis.fetch=native;await pool.end();const {db}=await import('../src/db');await db.$client.end();});
const input=(extra={})=>({revision:0,ageRating:12,genres:['Драма','Приключения'],chapters:[{id:ids[0],pageCount:24,readingMinutes:3},{id:ids[1],pageCount:28,readingMinutes:4}],...extra});
test('admin/editor CRUD retains omitted chapters, identity, reading history and unrelated fields',async()=>{
 const before=(await q('SELECT * FROM users WHERE id=$1',[actors[0].userId])).rows[0];
 await q('INSERT INTO user_chapter_reads(user_id,chapter_id,rating) VALUES($1,$2,4)',[actors[0].userId,ids[0]]);
 await service.savePresentation(actors[1],book,input());const data=await service.readPresentation(actors[0],book);
 assert.equal(data.revision,1);assert.equal(data.ageRating,12);assert.deepEqual(data.genres,['Драма','Приключения']);assert.equal(data.chapters[0].pageCount,24);
 await service.savePresentation(actors[0],book,input({revision:1,ageRating:null,genres:[],chapters:[]}));
 assert.equal((await service.readPresentation(actors[0],book)).chapters[0].pageCount,24);
 assert.deepEqual((await q('SELECT * FROM users WHERE id=$1',[actors[0].userId])).rows[0],before);
 assert.equal((await q('SELECT rating FROM user_chapter_reads WHERE user_id=$1 AND chapter_id=$2',[actors[0].userId,ids[0]])).rows[0].rating,4);
});
test('USER, revoked, inactive, expired and downgraded editor are refused',async()=>{
 await assert.rejects(service.savePresentation(actors[2],book,input()),{status:403});
 await q('DELETE FROM sessions WHERE id=$1',[actors[1].sessionId]);await assert.rejects(service.savePresentation(actors[1],book,input()),{status:401});
 await q('UPDATE users SET is_active=false WHERE id=$1',[actors[0].userId]);await assert.rejects(service.readPresentation(actors[0],book),{status:403});
 await q("UPDATE users SET role='USER' WHERE id=$1",[actors[1].userId]);await assert.rejects(service.savePresentation(actors[1],book,input()),{status:403});
 await q("UPDATE users SET role='EDITOR' WHERE id=$1",[actors[2].userId]);await q("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1",[actors[2].sessionId]);await assert.rejects(service.readPresentation(actors[2],book),{status:401});
});
test('foreign chapter rolls back preceding writes, tags, revision and audit',async()=>{
 const before=await service.readPresentation(actors[0],book);
 await assert.rejects(service.savePresentation(actors[0],book,input({chapters:[{id:ids[0],pageCount:24,readingMinutes:3},{id:ids[2],pageCount:99,readingMinutes:9}]})),{status:400});
 assert.deepEqual(await service.readPresentation(actors[0],book),before);
 assert.equal((await q("SELECT count(*)::int n FROM administrative_audit_events WHERE target_id=$1 AND details->>'channel'='presentation'",[book])).rows[0].n,0);
});
test('concurrent same revision has exactly one successful writer; no lost update/replay',async()=>{
 const results=await Promise.allSettled(Array.from({length:8},(_,i)=>service.savePresentation(actors[0],book,input({ageRating:i%2?12:16}))));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);for(const r of results)if(r.status==='rejected')assert.equal(r.reason.status,409);
 assert.equal((await service.readPresentation(actors[0],book)).revision,1);
});
test('private work cannot be edited through the shared metadata endpoint',async()=>{
 await q("UPDATE comics SET visibility='PRIVATE',owner_user_id=$1 WHERE id=$2",[actors[0].userId,book]);
 await assert.rejects(service.readPresentation(actors[0],book),{status:404});await assert.rejects(service.savePresentation(actors[0],book,input()),{status:404});
});
test('existing canonical comic/chapter writers preserve the new optional metadata',async()=>{
 await service.savePresentation(actors[0],book,input());
 const category=(await q('INSERT INTO categories(slug,name) VALUES($1,$2) RETURNING id',[randomUUID(),'Metadata compatibility'])).rows[0].id;
 try{
  const old=(await q('SELECT slug FROM comics WHERE id=$1',[book])).rows[0];const cat=(await q('SELECT slug FROM categories WHERE id=$1',[category])).rows[0];
  const {updateSharedCatalogComic}=await import('../src/modules/catalog/shared-catalog-mutations');
  await updateSharedCatalogComic({slug:old.slug,title:'Old importer title',description:null,authorName:null,translatorName:null,translatorNote:null,coverUrl:null,sourceUrl:null,totalChapters:null,publicationStatus:'PUBLISHED',categorySlug:cat.slug},{userId:actors[0].userId,role:'ADMIN'});
  const {updateSharedCatalogChapter}=await import('../src/modules/catalog/shared-chapter-mutations');
  await updateSharedCatalogChapter(book,ids[0],{displayCode:'1',title:'Old chapter editor',sourceUrl:null,status:'RELEASED',releasedAt:null},{userId:actors[0].userId,role:'ADMIN'});
  const current=await service.readPresentation(actors[0],book);assert.equal(current.revision,1);assert.equal(current.ageRating,12);assert.deepEqual(current.genres,['Драма','Приключения']);assert.equal(current.chapters[0].pageCount,24);assert.equal(current.chapters[0].readingMinutes,3);
 }finally{await q('DELETE FROM categories WHERE id=$1',[category]);}
});
test('audit failure rolls back all metadata and newly inserted dictionary entries',async()=>{
 const name='p_fault_'+randomUUID().replaceAll('-','');const unique='Тест '+randomUUID().replaceAll('-','');
 await q(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.details->>'channel'='presentation' THEN RAISE EXCEPTION 'synthetic fault'; END IF; RETURN NEW; END $$`);
 await q(`CREATE TRIGGER ${name} BEFORE INSERT ON administrative_audit_events FOR EACH ROW EXECUTE FUNCTION ${name}()`);
 try{await assert.rejects(service.savePresentation(actors[0],book,input({genres:[unique]})));assert.equal((await service.readPresentation(actors[0],book)).revision,0);assert.equal((await q('SELECT count(*)::int n FROM genres WHERE key=$1',[unique.toLocaleLowerCase('ru')])).rows[0].n,0);}finally{await q(`DROP TRIGGER ${name} ON administrative_audit_events`);await q(`DROP FUNCTION ${name}()`);}
});
test('volume average gives each reader equal weight, not each chapter vote',async()=>{
 for(const id of ids.slice(0,2))await q('INSERT INTO user_chapter_reads(user_id,chapter_id,rating) VALUES($1,$2,5)',[actors[0].userId,id]);
 await q('INSERT INTO user_chapter_reads(user_id,chapter_id,rating) VALUES($1,$2,1)',[actors[1].userId,ids[0]]);
 const result=await ratings.getCommunityRatings(book,actors[0].userId);assert.equal(result?.volumes?.[1].average,3);assert.equal(result?.volumes?.[1].votes,2);
 assert.equal(result?.viewerChapters?.[ids[0]].source,'diary');assert.deepEqual((await ratings.getCommunityRatings(book))?.viewerChapters,{});
});
test('review overrides legacy vote once; hidden/deleted never resurrect fallback',async()=>{
 const user=actors[0].userId;await q('INSERT INTO user_chapter_reads(user_id,chapter_id,rating) VALUES($1,$2,1)',[user,ids[0]]);
 const review=(await q('INSERT INTO community_reviews(comic_id,chapter_id,user_id,rating) VALUES($1,$2,$3,5) RETURNING id',[book,ids[0],user])).rows[0].id;
 let r=await ratings.getCommunityRatings(book,user);assert.equal(r?.volumes?.[1].average,5);assert.equal(r?.viewerChapters?.[ids[0]].source,'review');
 await q('UPDATE community_reviews SET hidden_at=now() WHERE id=$1',[review]);r=await ratings.getCommunityRatings(book,user);assert.equal(r?.volumes?.[1],undefined);assert.equal(r?.viewerChapters?.[ids[0]].hidden,true);
 await q('UPDATE community_reviews SET deleted_at=now() WHERE id=$1',[review]);r=await ratings.getCommunityRatings(book,user);assert.equal(r?.viewerChapters?.[ids[0]].rating,null);assert.equal(r?.viewerChapters?.[ids[0]].source,'withdrawn');
});
test('scheduled/archived/special votes do not distort main volume rating and private access holds',async()=>{
 await q("UPDATE chapters SET kind='SPECIAL' WHERE id=$1",[ids[0]]);await q('INSERT INTO user_chapter_reads(user_id,chapter_id,rating) VALUES($1,$2,5)',[actors[0].userId,ids[0]]);
 assert.deepEqual((await ratings.getCommunityRatings(book))?.volumes,{});
 await q("UPDATE comics SET visibility='PRIVATE',owner_user_id=$1 WHERE id=$2",[actors[0].userId,book]);assert.equal(await ratings.getCommunityRatings(book,actors[1].userId),null);
});
