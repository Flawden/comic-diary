/** Dedicated synthetic PostgreSQL only. Never loads dotenv or real credentials. */
import assert from 'node:assert/strict';import {randomUUID,randomBytes,createHash} from 'node:crypto';import {before,beforeEach,after,afterEach,test} from 'node:test';import {Pool} from 'pg';import type {Actor,Target} from '../src/modules/community/policy';
const target=process.env.REVIEWS_TEST_DATABASE_URL;if(!target)throw Error('explicit disposable REVIEWS_TEST_DATABASE_URL required');const url=new URL(target);
const local=url.hostname==='127.0.0.1'&&url.port==='55545'&&url.username==='review01_qa'&&url.pathname==='/review01_review';
const ci=process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='Flawden/comic-diary'&&url.hostname==='127.0.0.1'&&url.port==='5432'&&url.username==='comic_diary_ci'&&url.pathname==='/comic_diary_release';
if(url.protocol!=='postgresql:'||(!local&&!ci)||url.search||url.hash)throw Error('REFUSED database');Object.assign(process.env,{DATABASE_URL:target,NODE_ENV:'test'});
const pool=new Pool({connectionString:target});let svc:typeof import('../src/modules/community/review-service'),ratings:typeof import('../src/modules/library/queries/get-community-ratings');let actors:Actor[],books:number[],chapter:number,scheduled:number;let t:Target;const native=globalThis.fetch;
const q=(s:string,v:unknown[]=[])=>pool.query(s,v);const input=(extra={})=>({...t,scores:[5,4,3,2,1],body:'Тестовый отзыв',...extra});
before(async()=>{globalThis.fetch=async()=>{throw Error('UNMOCKED HTTP FORBIDDEN');};svc=await import('../src/modules/community/review-service');ratings=await import('../src/modules/library/queries/get-community-ratings');});
beforeEach(async()=>{actors=[];books=[];for(let i=0;i<3;i++){const user=(await q("INSERT INTO users(email,display_name,password_hash,email_verified_at) VALUES($1,$2,'synthetic-unused',now()) RETURNING id",[randomUUID()+'@example.invalid','Читатель '+i])).rows[0];const s=(await q("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour') RETURNING id",[user.id,createHash('sha256').update(randomBytes(32)).digest('hex')])).rows[0];actors.push({userId:user.id,sessionId:s.id});}
 for(const status of ['PUBLISHED','PUBLISHED','HIDDEN'])books.push((await q("INSERT INTO comics(slug,title,publication_status) VALUES($1,'Review fixture',$2) RETURNING id",[randomUUID(),status])).rows[0].id);
 chapter=(await q("INSERT INTO chapters(comic_id,display_code,sort_order,status) VALUES($1,'1',1,'RELEASED') RETURNING id",[books[0]])).rows[0].id;scheduled=(await q("INSERT INTO chapters(comic_id,display_code,sort_order,status) VALUES($1,'2',2,'SCHEDULED') RETURNING id",[books[0]])).rows[0].id;t={comicId:books[0],chapterId:null};});
afterEach(async()=>{await q('DELETE FROM community_comment_moderation_events WHERE review_id IN (SELECT id FROM community_reviews WHERE comic_id=ANY($1::int[]))',[books]);await q('DELETE FROM user_chapter_reads WHERE user_id=ANY($1::int[])',[actors.map(a=>a.userId)]);await q('DELETE FROM comics WHERE id=ANY($1::int[])',[books]);await q('DELETE FROM users WHERE id=ANY($1::int[])',[actors.map(a=>a.userId)]);});
after(async()=>{globalThis.fetch=native;await pool.end();const {db}=await import('../src/db');await db.$client.end();});
test('first save, replay, versioned edit and soft removal preserve one immutable record',async()=>{const a=actors[0];const created=await svc.saveReview(a,input());assert.equal(created.replay,false);assert.equal((await svc.saveReview(a,input())).replay,true);const edited=await svc.saveReview(a,input({version:1,body:'Обновлённый текст'}));assert.equal(edited.id,created.id);assert.equal(edited.version,2);await assert.rejects(svc.saveReview(a,input({version:1,body:'Stale'})),{status:409});assert.equal((await svc.listReviews(t,a.userId)).mine?.body,'Обновлённый текст');await svc.removeReview(a,created.id,2);assert.equal((await svc.listReviews(t,a.userId)).total,0);assert.equal((await q('SELECT count(*)::int n FROM community_reviews WHERE comic_id=$1',[books[0]])).rows[0].n,1);await assert.rejects(svc.saveReview(a,input({version:1})),{status:409});});
test('parallel identical first requests persist exactly one review and one quota consumption',async()=>{const all=await Promise.all(Array.from({length:8},()=>svc.saveReview(actors[0],input())));assert.equal(new Set(all.map(x=>x.id)).size,1);assert.equal(all.filter(x=>!x.replay).length,1);assert.equal((await q('SELECT post_count FROM community_comment_restrictions WHERE user_id=$1',[actors[0].userId])).rows[0].post_count,1);});
test('parallel distinct creation and editing produce conflict instead of silent overwrite',async()=>{const all=await Promise.allSettled([svc.saveReview(actors[0],input()),svc.saveReview(actors[0],input({body:'Другое мнение'}))]);assert.equal(all.filter(x=>x.status==='fulfilled').length,1);assert.equal(all.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);const edit=await Promise.allSettled([svc.saveReview(actors[0],input({body:'Редакция А',version:1})),svc.saveReview(actors[0],input({body:'Редакция Б',version:1}))]);assert.equal(edit.filter(x=>x.status==='fulfilled').length,1);assert.equal((await svc.listReviews(t,null)).total,1);});
test('one reaction per user survives parallel requests, switches and clears',async()=>{const item=await svc.saveReview(actors[0],input());await Promise.all(Array.from({length:8},()=>svc.reactToReview(actors[1],item.id,{value:1})));let r=(await svc.listReviews(t,actors[1].userId)).items[0];assert.equal(r.up,1);assert.equal(r.reaction,1);await svc.reactToReview(actors[1],item.id,{value:-1});r=(await svc.listReviews(t,actors[1].userId)).items[0];assert.equal(r.up,0);assert.equal(r.down,1);await svc.reactToReview(actors[1],item.id,{value:0});assert.equal((await svc.listReviews(t,null)).items[0].down,0);await assert.rejects(svc.reactToReview(actors[0],item.id,{value:1}),{status:403});});
test('no identity injection, invalid scores, reply fields or foreign deletion',async()=>{for(const extra of [{userId:actors[1].userId},{parentId:123},{scores:[0,2,3,4,5]},{scores:[5]},{version:0}])await assert.rejects(svc.saveReview(actors[0],input(extra)),{status:400});const item=await svc.saveReview(actors[0],input());await assert.rejects(svc.removeReview(actors[1],item.id,1),{status:403});assert.equal((await svc.listReviews(t,null)).total,1);});
test('revoked/expired/inactive sessions and community restrictions fail closed',async()=>{await q('DELETE FROM sessions WHERE id=$1',[actors[0].sessionId]);await assert.rejects(svc.saveReview(actors[0],input()),{status:401});await q("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1",[actors[1].sessionId]);await assert.rejects(svc.saveReview(actors[1],input()),{status:401});await q('UPDATE users SET is_active=false WHERE id=$1',[actors[2].userId]);await assert.rejects(svc.saveReview(actors[2],input()),{status:401});});
test('blocked account and request rate limit reuse existing transactional guards',async()=>{await q("INSERT INTO community_comment_restrictions(user_id,blocked_until) VALUES($1,now()+interval '1 hour')",[actors[0].userId]);await assert.rejects(svc.saveReview(actors[0],input()),{status:403});await svc.saveReview(actors[1],input());await assert.rejects(svc.saveReview(actors[1],{comicId:books[0],chapterId:chapter,scores:[5]}),{status:429});});
test('hidden/private/scheduled/wrong-work targets cannot publish or leak reviews',async()=>{await assert.rejects(svc.saveReview(actors[0],input({comicId:books[2]})),{status:404});await assert.rejects(svc.saveReview(actors[0],input({chapterId:scheduled,scores:[4]})),{status:404});await assert.rejects(svc.saveReview(actors[0],input({comicId:books[1],chapterId:chapter,scores:[4]})),{status:404});await q("UPDATE comics SET visibility='PRIVATE',owner_user_id=$1 WHERE id=$2",[actors[0].userId,books[1]]);await assert.rejects(svc.listReviews({comicId:books[1],chapterId:null},actors[0].userId),{status:404});});
test('chapter review uses one score, follows a moved chapter and enforces binding in PostgreSQL',async()=>{const item=await svc.saveReview(actors[0],{comicId:books[0],chapterId:chapter,scores:[4],body:''});assert.equal((await svc.listReviews({comicId:books[0],chapterId:chapter},null)).items[0].scores[0],4);await assert.rejects(q('UPDATE community_reviews SET comic_id=$1 WHERE id=$2',[books[1],item.id]),{code:'23503'});await q('UPDATE chapters SET comic_id=$1 WHERE id=$2',[books[1],chapter]);assert.equal((await svc.listReviews({comicId:books[1],chapterId:chapter},null)).total,1);assert.equal((await q('SELECT comic_id FROM community_reviews WHERE id=$1',[item.id])).rows[0].comic_id,books[1]);});
test('public averages count each reader once; deletion does not republish old diary scores',async()=>{await q("INSERT INTO user_comics(user_id,comic_id,rating_plot,personal_note) VALUES($1,$3,1,'DO NOT PUBLISH'),($2,$3,5,'PRIVATE')",[actors[0].userId,actors[1].userId,books[0]]);assert.equal((await ratings.getCommunityRatings(books[0]))?.overall.average,3);const item=await svc.saveReview(actors[0],input({scores:[5,5,5,5,5]}));const aggregate=await ratings.getCommunityRatings(books[0]);assert.equal(aggregate?.overall.votes,2);assert.equal(aggregate?.overall.average,5);const publicPage=JSON.stringify(await svc.listReviews(t,null));assert.ok(!publicPage.includes('DO NOT PUBLISH'));assert.ok(!publicPage.includes('PRIVATE'));assert.ok(!publicPage.includes('userId'));await svc.removeReview(actors[0],item.id,1);assert.equal((await ratings.getCommunityRatings(books[0]))?.overall.votes,1);assert.equal((await q('SELECT personal_note FROM user_comics WHERE user_id=$1 AND comic_id=$2',[actors[0].userId,books[0]])).rows[0].personal_note,'DO NOT PUBLISH');});
test('chapter averages deduplicate legacy read rating and public review',async()=>{await q('INSERT INTO user_chapter_reads(user_id,chapter_id,rating) VALUES($1,$3,1),($2,$3,3)',[actors[0].userId,actors[1].userId,chapter]);await svc.saveReview(actors[0],{comicId:books[0],chapterId:chapter,scores:[5]});const r=(await ratings.getCommunityRatings(books[0]))!.chapters[chapter];assert.equal(r.votes,2);assert.equal(r.average,4);});

test('score-only chapter edits preserve historical text, spoiler and private diary',async()=>{
 const target={comicId:books[0],chapterId:chapter};
 await q('INSERT INTO user_chapter_reads(user_id,chapter_id,rating) VALUES($1,$2,1)',[actors[0].userId,chapter]);
 const original=await svc.saveReview(actors[0],{...target,scores:[5],body:'Historical text kept verbatim',spoiler:true});
 await svc.saveChapterRating(actors[0],{...target,rating:4,version:original.version});
 const row=(await q('SELECT body,spoiler,rating,version FROM community_reviews WHERE id=$1',[original.id])).rows[0];
 await assert.rejects(svc.reactToReview(actors[1],original.id,{value:1}),{status:404});
 assert.deepEqual(row,{body:'Historical text kept verbatim',spoiler:true,rating:4,version:2});
 assert.deepEqual(await svc.ownChapterRating(target,actors[0]),{rating:4,version:2,hidden:false});
 assert.deepEqual(await svc.ownChapterRating(target,actors[1]),{rating:null,version:null,hidden:false});
 assert.equal((await q('SELECT rating FROM user_chapter_reads WHERE user_id=$1 AND chapter_id=$2',[actors[0].userId,chapter])).rows[0].rating,1);
 await svc.saveChapterRating(actors[0],{...target,rating:null,version:2});
 assert.equal((await ratings.getCommunityRatings(books[0]))?.chapters[chapter]?.votes??0,0);
 assert.equal((await q('SELECT body FROM community_reviews WHERE id=$1',[original.id])).rows[0].body,row.body);
 await assert.rejects(svc.saveChapterRating(actors[0],{...target,rating:3,version:3}),{status:429});
 await q("UPDATE community_comment_restrictions SET last_post_at=now()-interval '16 seconds' WHERE user_id=$1",[actors[0].userId]);
 await svc.saveChapterRating(actors[0],{...target,rating:3,version:3});
 assert.equal((await q('SELECT body FROM community_reviews WHERE id=$1',[original.id])).rows[0].body,row.body);
});
test('parallel chapter ratings consume once; stale changes, wrong targets and expired sessions fail',async()=>{
 const target={comicId:books[0],chapterId:chapter};const input={...target,rating:5,version:null};
 assert.deepEqual(await svc.ownChapterRating(target,actors[0]),{rating:null,version:null,hidden:false});
 assert.equal((await q('SELECT count(*)::int n FROM community_comment_restrictions WHERE user_id=$1',[actors[0].userId])).rows[0].n,0);
 const all=await Promise.all(Array.from({length:8},()=>svc.saveChapterRating(actors[0],input)));
 assert.equal(all.filter(x=>'replay' in x&&!x.replay).length,1);
 const edit=await Promise.allSettled([svc.saveChapterRating(actors[0],{...input,rating:3,version:1}),svc.saveChapterRating(actors[0],{...input,rating:4,version:1})]);
 assert.equal(edit.filter(x=>x.status==='fulfilled').length,1);assert.equal(edit.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);
 await assert.rejects(svc.saveChapterRating(actors[0],{...input,comicId:books[1]}),{status:404});
 await assert.rejects(svc.saveChapterRating(actors[0],{...input,chapterId:scheduled}),{status:404});
 for(const extra of [{userId:actors[1].userId},{body:'text'},{spoiler:true}])await assert.rejects(svc.saveChapterRating(actors[0],{...input,...extra}),{status:400});
 await q("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1",[actors[0].sessionId]);
 await assert.rejects(svc.ownChapterRating(target,actors[0]),{status:401});await assert.rejects(svc.saveChapterRating(actors[0],{...input,rating:2,version:2}),{status:401});
});
test('empty text, safe literal HTML, filters, counts and deterministic pagination',async()=>{await svc.saveReview(actors[0],input({body:''}));await svc.saveReview(actors[1],input({body:'<script>alert(1)</script>'}));assert.equal((await svc.listReviews(t,null,null,'scores')).total,1);assert.equal((await svc.listReviews(t,null,null,'text')).items[0].body,'<script>alert(1)</script>');assert.equal((await svc.getReviewCounts(books[0])).work,2);assert.equal((await svc.listReviews(t,actors[0].userId,null,'text')).mine?.body,'');assert.equal((await svc.listReviews(t,null,null,'all','old')).items[0].body,'');});
test('database enforces unique review, valid purpose shape and reaction values',async()=>{const item=await svc.saveReview(actors[0],input());await assert.rejects(q('INSERT INTO community_reviews(comic_id,user_id,rating_plot,rating_characters,rating_art,rating_depth,rating_world) SELECT comic_id,user_id,1,1,1,1,1 FROM community_reviews WHERE id=$1',[item.id]),{code:'23505'});await assert.rejects(q('UPDATE community_reviews SET rating_plot=NULL WHERE id=$1',[item.id]),{code:'23514'});await assert.rejects(q('INSERT INTO community_review_reactions(review_id,user_id,value) VALUES($1,$2,2)',[item.id,actors[1].userId]),{code:'23514'});});
test('failed insert rolls back quota and review atomically',async()=>{await q("CREATE FUNCTION reviews_test_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic fault'; END $$");await q('CREATE TRIGGER reviews_test_fault BEFORE INSERT ON community_reviews FOR EACH ROW EXECUTE FUNCTION reviews_test_fault()');try{await assert.rejects(svc.saveReview(actors[0],input()));assert.equal((await svc.listReviews(t,null)).total,0);assert.equal((await q('SELECT count(*)::int n FROM community_comment_restrictions WHERE user_id=$1',[actors[0].userId])).rows[0].n,0);}finally{await q('DROP TRIGGER reviews_test_fault ON community_reviews');await q('DROP FUNCTION reviews_test_fault()');}assert.equal((await svc.saveReview(actors[0],input())).replay,false);});
test('session expiry while waiting on catalog row rolls back all writes',async()=>{
 await q("UPDATE sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1",[actors[0].sessionId]);
 const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT id FROM comics WHERE id=$1 FOR UPDATE',[books[0]]);
 const write=svc.saveReview(actors[0],input());const checked=assert.rejects(write,{status:401});
 try{let waited=false;for(let i=0;i<100;i++){const n=(await q("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%comics%for share%'")).rows[0].n;if(n>0){waited=true;break;}await new Promise(r=>setTimeout(r,5));}assert.ok(waited);await new Promise(r=>setTimeout(r,1100));await blocker.query('COMMIT');await checked;assert.equal((await svc.listReviews(t,null)).total,0);assert.equal((await q('SELECT count(*)::int n FROM community_comment_restrictions WHERE user_id=$1',[actors[0].userId])).rows[0].n,0);}finally{await blocker.query('ROLLBACK');blocker.release();await checked;}
});
test('keyset pages do not duplicate readers in either direction',async()=>{
 for(let i=0;i<23;i++){const id=(await q("INSERT INTO users(email,display_name,password_hash) VALUES($1,'Page reader','synthetic-unused') RETURNING id",[randomUUID()+'@example.invalid'])).rows[0].id;actors.push({userId:id,sessionId:1});await q('INSERT INTO community_reviews(comic_id,user_id,rating_plot,rating_characters,rating_art,rating_depth,rating_world) VALUES($1,$2,1,2,3,4,5)',[books[0],id]);}
 for(const order of ['new','old'] as const){const first=await svc.listReviews(t,null,null,'all',order);assert.equal(first.items.length,20);assert.ok(first.nextCursor);const second=await svc.listReviews(t,null,first.nextCursor,'all',order);assert.equal(second.items.length,3);assert.equal(second.nextCursor,null);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,23);}
});
test('moderation hides content/votes, is audited, cannot be bypassed by owner and can restore',async()=>{
 await q("UPDATE users SET role='ADMIN' WHERE id=$1",[actors[2].userId]);
 await q('INSERT INTO user_comics(user_id,comic_id,rating_plot) VALUES($1,$2,1)',[actors[0].userId,books[0]]);
 const item=await svc.saveReview(actors[0],input());await assert.rejects(svc.moderateReview(actors[1],item.id,{action:'HIDE',reason:'test'}),{status:403});
 await svc.moderateReview(actors[2],item.id,{action:'HIDE',reason:'Нарушение правил'});await svc.moderateReview(actors[2],item.id,{action:'HIDE',reason:'Повтор'});
 assert.equal((await svc.listReviews(t,null)).total,0);assert.equal((await ratings.getCommunityRatings(books[0]))?.overall.votes,0);
 assert.equal((await svc.listReviews(t,actors[0].userId)).mine?.hidden,true);
 await assert.rejects(svc.saveReview(actors[0],input({version:2,body:'bypass'})),{status:403});await assert.rejects(svc.reactToReview(actors[1],item.id,{value:1}),{status:404});
 await assert.rejects(svc.listReviews(t,actors[1].userId,null,'hidden','new',actors[1]),{status:403});
 assert.equal((await svc.listReviews(t,actors[2].userId,null,'hidden','new',actors[2])).total,1);
 assert.equal((await q('SELECT count(*)::int n FROM community_comment_moderation_events WHERE review_id=$1',[item.id])).rows[0].n,1);
 await svc.moderateReview(actors[2],item.id,{action:'RESTORE',reason:'Проверено'});assert.equal((await svc.listReviews(t,null)).total,1);
 await q("UPDATE users SET role='USER' WHERE id=$1",[actors[2].userId]);await assert.rejects(svc.moderateReview(actors[2],item.id,{action:'HIDE',reason:'stale role'}),{status:403});
});
test('moderator restore never resurrects a review removed by its owner',async()=>{
 await q("UPDATE users SET role='ADMIN' WHERE id=$1",[actors[2].userId]);const item=await svc.saveReview(actors[0],input());await svc.moderateReview(actors[2],item.id,{action:'HIDE',reason:'test'});await svc.removeReview(actors[0],item.id,2);await svc.moderateReview(actors[2],item.id,{action:'RESTORE',reason:'test'});assert.equal((await svc.listReviews(t,null)).total,0);
});
test('historical replies stay flat/readable, hidden bodies are redacted and identities private',async()=>{
 const comment=(await q("INSERT INTO community_comments(comic_id,author_user_id,request_id,request_digest,body) VALUES($1,$2,$3,repeat('a',64),'Old root') RETURNING id",[books[0],actors[0].userId,randomUUID()])).rows[0].id;
 await q("INSERT INTO community_comments(comic_id,author_user_id,parent_id,request_id,request_digest,body,status) VALUES($1,$2,$3,$4,repeat('b',64),'Hidden secret','HIDDEN_BY_MODERATOR')",[books[0],actors[1].userId,comment,randomUUID()]);
 const archive=await svc.reviewHistory(t,null,actors[0].userId);assert.equal(archive.items.length,2);assert.equal(archive.items[0].mine,true);assert.equal(archive.items[1].body,null);const encoded=JSON.stringify(archive);assert.ok(!encoded.includes('parentId'));assert.ok(!encoded.includes('userId'));assert.ok(!encoded.includes('Hidden secret'));assert.equal((await svc.listReviews(t,null)).total,0);
});

test('owner removal atomically clears both reactions; republication and old tombstones start at zero',async()=>{
 const item=await svc.saveReview(actors[0],input());await svc.reactToReview(actors[1],item.id,{value:1});await svc.reactToReview(actors[2],item.id,{value:-1});
 await svc.removeReview(actors[0],item.id,1);assert.equal((await q('SELECT count(*)::int n FROM community_review_reactions WHERE review_id=$1',[item.id])).rows[0].n,0);
 // Emulate a tombstone from the pre-fix version without changing migration history.
 await q('INSERT INTO community_review_reactions(review_id,user_id,value) VALUES($1,$2,1)',[item.id,actors[1].userId]);
 await q("UPDATE community_comment_restrictions SET last_post_at=now()-interval '16 seconds' WHERE user_id=$1",[actors[0].userId]);
 const restored=await svc.saveReview(actors[0],input());assert.equal(restored.id,item.id);const row=(await svc.listReviews(t,null)).items[0];assert.equal(row.up,0);assert.equal(row.down,0);
});
test('reaction cleanup rolls back with failed review deletion',async()=>{
 const item=await svc.saveReview(actors[0],input());await svc.reactToReview(actors[1],item.id,{value:1});
 const name='reviews_delete_failure_'+item.id;
 await q(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=${item.id} AND NEW.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'synthetic deletion failure'; END IF; RETURN NEW; END $$`);
 await q(`CREATE TRIGGER ${name} BEFORE UPDATE ON community_reviews FOR EACH ROW EXECUTE FUNCTION ${name}()`);
 try{await assert.rejects(svc.removeReview(actors[0],item.id,1));assert.equal((await svc.listReviews(t,null)).items[0].up,1);assert.equal((await svc.listReviews(t,null)).items[0].version,1);}
 finally{await q(`DROP TRIGGER ${name} ON community_reviews`);await q(`DROP FUNCTION ${name}()`);}
});
test('parallel reaction and removal serialize; deletion replay cannot recreate reactions',async()=>{
 const item=await svc.saveReview(actors[0],input());const results=await Promise.allSettled([svc.reactToReview(actors[1],item.id,{value:1}),svc.removeReview(actors[0],item.id,1),svc.reactToReview(actors[2],item.id,{value:-1})]);
 assert.equal(results[1].status,'fulfilled');for(const r of [results[0],results[2]])if(r.status==='rejected')assert.equal(r.reason.status,404);
 await svc.removeReview(actors[0],item.id,1);assert.equal((await q('SELECT count(*)::int n FROM community_review_reactions WHERE review_id=$1',[item.id])).rows[0].n,0);assert.equal((await svc.listReviews(t,null)).total,0);
});
test('hide/restore retains reactions and review-specific admin audit with author/action/reason/time',async()=>{
 const {moderationQueue}=await import('../src/modules/community/service');await q("UPDATE users SET role='ADMIN' WHERE id=$1",[actors[2].userId]);
 const item=await svc.saveReview(actors[0],input());const other=await svc.saveReview(actors[1],input());await svc.reactToReview(actors[1],item.id,{value:1});await svc.reactToReview(actors[2],item.id,{value:-1});
 await svc.moderateReview(actors[2],item.id,{action:'HIDE',reason:'First reason'});await svc.moderateReview(actors[2],other.id,{action:'HIDE',reason:'Other review'});
 assert.equal((await svc.listReviews(t,actors[2].userId,null,'hidden','new',actors[2])).items.find(r=>r.id===item.id)?.up,1);
 await svc.moderateReview(actors[2],item.id,{action:'RESTORE',reason:'Second reason'});const restored=(await svc.listReviews(t,null)).items[0];assert.equal(restored.up,1);assert.equal(restored.down,1);
 const audit=await moderationQueue(actors[2],'OPEN',null,{reviewId:item.id});assert.equal(audit.audit.length,2);assert.deepEqual(audit.audit.map(e=>e.action),['RESTORE','HIDE']);assert.deepEqual(audit.audit.map(e=>e.reason),['Second reason','First reason']);assert.ok(audit.audit.every(e=>e.reviewId===item.id&&e.actorUserId===actors[2].userId&&!Number.isNaN(Date.parse(e.createdAt))));
 assert.ok((await moderationQueue(actors[2])).audit.some(e=>e.reviewId===other.id));await assert.rejects(moderationQueue(actors[1],'OPEN',null,{reviewId:item.id}),{status:403});
 // A full history stays reachable even when it exceeds the recent-events page.
 await q("INSERT INTO community_comment_moderation_events(actor_user_id,action,review_id,reason) SELECT $1,'HIDE',$2,'synthetic history '||n FROM generate_series(1,23) n",[actors[2].userId,item.id]);
 const first=await moderationQueue(actors[2],'OPEN',null,{reviewId:item.id});assert.equal(first.audit.length,20);assert.ok(first.nextAuditCursor);const second=await moderationQueue(actors[2],'OPEN',null,{reviewId:item.id,auditCursor:first.nextAuditCursor});assert.equal(second.audit.length,5);assert.equal(second.nextAuditCursor,null);assert.equal(new Set([...first.audit,...second.audit].map(e=>e.id)).size,25);
});
