/** Real disposable PostgreSQL, independent connections, no production targets. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { before, beforeEach, after, afterEach, test } from "node:test";
import { writeFile } from "node:fs/promises";
import { Pool } from "pg";
import type { Actor, Target } from "../src/modules/community/policy";
const url = new URL(process.env.COMMUNITY01_TEST_DATABASE_URL ?? "invalid:");
const local = url.hostname === "127.0.0.1" && url.port === "55503" && url.username === "community01_qa" && url.pathname === "/community01_review";
const ci = process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_REPOSITORY === "Flawden/comic-diary" && url.hostname === "127.0.0.1" && url.port === "5432" && url.username === "comic_diary_ci" && url.pathname === "/comic_diary_release";
if (url.protocol !== "postgresql:" || (!local && !ci) || url.search || url.hash) throw Error("REFUSED: disposable COMMUNITY target required");
Object.assign(process.env, { DATABASE_URL: url.href, NODE_ENV: "test" });
const pool = new Pool({ connectionString: url.href });
let service: typeof import("../src/modules/community/service");
let CommunityError: typeof import("../src/modules/community/policy").CommunityError;
let db: typeof import("../src/db").db;
let actors: Actor[], books: number[], target: Target, chapter: number, special: number, scheduled: number, archived: number, foreign: number;
const nativeFetch = globalThis.fetch;
const code = (status: number) => (e: unknown) => e instanceof CommunityError && e.status === status;
const comment = (body = "Synthetic comment") => ({ ...target, body, requestId: randomUUID() });
const allowPost = (a = actors[0]) => pool.query("UPDATE community_comment_restrictions SET last_post_at=clock_timestamp()-interval '16 seconds' WHERE user_id=$1", [a.userId]);
before(async () => {
  globalThis.fetch = async () => { throw Error("External HTTP forbidden in COMMUNITY PG tests"); };
  service = await import("../src/modules/community/service");
  ({ CommunityError } = await import("../src/modules/community/policy"));
  ({ db } = await import("../src/db"));
});
beforeEach(async () => {
  actors = []; books = [];
  for (const [i, role] of ["USER", "USER", "ADMIN", "EDITOR"].entries()) {
    const userId = (await pool.query("INSERT INTO users(email,display_name,password_hash,role,is_active,email_verified_at,verification_required_at) VALUES($1,$2,'synthetic-unused-hash',$3,true,now(),NULL) RETURNING id", [`community-${randomUUID()}@example.invalid`, `Reader ${i}`, role])).rows[0].id;
    const hash = createHash("sha256").update(randomBytes(32)).digest("hex");
    const sessionId = (await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour') RETURNING id", [userId, hash])).rows[0].id;
    actors.push({ userId, sessionId });
  }
  for (const status of ["PUBLISHED", "PUBLISHED", "HIDDEN", "ARCHIVED"]) books.push((await pool.query("INSERT INTO comics(slug,title,source_url,publication_status) VALUES($1,'Community fixture','https://example.invalid/community',$2) RETURNING id", [randomUUID(), status])).rows[0].id);
  target = { comicId: books[0], chapterId: null };
  const ids: number[] = [];
  for (const [status, kind] of [["RELEASED", "MAIN"], ["RELEASED", "SPECIAL"], ["SCHEDULED", "MAIN"], ["ARCHIVED", "MAIN"]]) ids.push((await pool.query("INSERT INTO chapters(comic_id,display_code,sort_order,status,kind) VALUES($1,$2,$3,$4,$5) RETURNING id", [books[0], String(ids.length+1), ids.length+1, status, kind])).rows[0].id);
  [chapter, special, scheduled, archived] = ids;
  foreign = (await pool.query("INSERT INTO chapters(comic_id,display_code,sort_order,status) VALUES($1,'foreign',1,'RELEASED') RETURNING id", [books[1]])).rows[0].id;
});
afterEach(async () => {
  const ids = actors.map(a => a.userId);
  await pool.query("DELETE FROM community_comment_moderation_events WHERE actor_user_id=ANY($1::int[]) OR target_user_id=ANY($1::int[]) OR comment_id IN (SELECT id FROM community_comments WHERE comic_id=ANY($2::int[]))", [ids, books]);
  await pool.query("DELETE FROM user_chapter_reads WHERE user_id=ANY($1::int[])", [ids]);
  await pool.query("DELETE FROM comics WHERE id=ANY($1::int[])", [books]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::int[])", [ids]);
});
after(async () => { globalThis.fetch = nativeFetch; await pool.end(); await db.$client.end(); });

test("create/read/edit/delete tombstone; public DTO never exposes identities/notes/idempotency data", async () => {
  const v = comment("<script>window.bad=1</script> 🐉");
  const result = await service.createComment(actors[0], v); assert.equal(result.replay, false);
  const page = await service.listComments(target);
  assert.equal(page.items[0].body, v.body); assert.equal(page.items[0].mine, false);
  assert.deepEqual(Object.keys(page.items[0]).sort(), ["id","parentId","author","mine","body","spoiler","status","createdAt","editedAt"].sort());
  assert.doesNotMatch(JSON.stringify(page), /userId|authorUserId|reporter|requestId|requestDigest|example.invalid|password|personalNote/);
  await assert.rejects(service.editComment(actors[1], result.item.id, { body: "stolen", spoiler: false }), code(403));
  await assert.rejects(service.deleteComment(actors[1], result.item.id), code(403));
  const edited = await service.editComment(actors[0], result.item.id, { body: "Edited", spoiler: true });
  assert.equal(edited.body, "Edited"); assert.ok(edited.editedAt);
  await service.deleteComment(actors[0], result.item.id); await service.deleteComment(actors[0], result.item.id);
  assert.deepEqual((await service.listComments(target)).items.map(i => [i.body,i.status]), [[null,"REMOVED_BY_AUTHOR"]]);
  assert.equal((await pool.query("SELECT body FROM community_comments WHERE id=$1",[result.item.id])).rows[0].body,null);
  await assert.rejects(service.editComment(actors[0], result.item.id, {body:"resurrect",spoiler:false}),code(409));
  assert.equal((await service.createComment(actors[0],v)).item.body,null);
});
test("one-level replies stay in their discussion and survive parent tombstone", async () => {
  const root = (await service.createComment(actors[0],comment())).item;
  const reply = (await service.createComment(actors[1],{...comment("Reply"),parentId:root.id})).item;
  await allowPost(actors[1]);
  await assert.rejects(service.createComment(actors[1],{...comment(),parentId:reply.id}),code(400));
  await assert.rejects(service.createComment(actors[1],{...comment(),comicId:books[1],parentId:root.id}),code(404));
  await assert.rejects(service.createComment(actors[1],{...comment(),chapterId:chapter,parentId:root.id}),code(404));
  await service.deleteComment(actors[0],root.id);
  const page=await service.listComments(target);assert.equal(page.items[0].body,null);assert.equal(page.items[1].body,"Reply");assert.equal(page.items[1].parentId,root.id);
  await assert.rejects(service.createComment(actors[1],{...comment(),parentId:root.id}),code(409));
});
test("work/chapter separation, chapter spoiler default, current publication and moved-chapter guard",async()=>{
  await service.createComment(actors[0],comment("Work"));await allowPost();
  const row=(await service.createComment(actors[0],{...comment("Chapter"),chapterId:chapter})).item;assert.equal(row.spoiler,true);
  assert.deepEqual((await service.listComments(target)).items.map(i=>i.body),["Work"]);
  assert.deepEqual((await service.listComments({...target,chapterId:chapter})).items.map(i=>i.body),["Chapter"]);
  await allowPost();await service.createComment(actors[0],{...comment("Special"),chapterId:special});
  for(const id of [scheduled,archived,foreign]){
    await assert.rejects(service.listComments({...target,chapterId:id}),code(404));
    await assert.rejects(service.createComment(actors[0],{...comment(),chapterId:id}),code(404));
  }
  await pool.query("UPDATE chapters SET comic_id=$2 WHERE id=$1",[chapter,books[1]]);
  await assert.rejects(service.listComments({...target,chapterId:chapter}),code(404));
  assert.equal((await service.listComments({comicId:books[1],chapterId:chapter})).items.length,0);
  await assert.rejects(service.editComment(actors[0],row.id,{body:"x",spoiler:false}),code(404));
});
for(const mode of ["PRIVATE","HIDDEN","ARCHIVED"]){
  test(`all public access paths close after ${mode}, including owner/admin`,async()=>{
    const row=(await service.createComment(actors[0],comment())).item;
    await service.reportComment(actors[1],row.id,{reason:"SPAM"});
    if(mode==="PRIVATE")await pool.query("UPDATE comics SET visibility='PRIVATE',owner_user_id=$2 WHERE id=$1",[target.comicId,actors[0].userId]);
    else await pool.query("UPDATE comics SET publication_status=$2 WHERE id=$1",[target.comicId,mode]);
    await assert.rejects(service.listComments(target),code(404));
    await assert.rejects(service.createComment(actors[0],comment()),code(404));
    await assert.rejects(service.editComment(actors[0],row.id,{body:"x",spoiler:false}),code(404));
    await assert.rejects(service.deleteComment(actors[0],row.id),code(404));
    await assert.rejects(service.reportComment(actors[1],row.id,{reason:"SPAM"}),code(404));
    await assert.rejects(service.moderate(actors[2],{action:"HIDE",commentId:row.id,reason:"review"}),code(404));
    assert.equal((await service.moderationQueue(actors[2])).items.length,0);
  });
}
test("existing chapter discussion and its moderation report close immediately on unrelease/archive",async()=>{
  const row=(await service.createComment(actors[0],{...comment(),chapterId:chapter})).item;
  await service.reportComment(actors[1],row.id,{reason:"SPOILER"});
  for(const status of ["SCHEDULED","ARCHIVED"]){
    await pool.query("UPDATE chapters SET status=$2 WHERE id=$1",[chapter,status]);
    await assert.rejects(service.listComments({...target,chapterId:chapter}),code(404));
    await assert.rejects(service.editComment(actors[0],row.id,{body:"x",spoiler:false}),code(404));
    await assert.rejects(service.reportComment(actors[3],row.id,{reason:"SPAM"}),code(404));
    assert.equal((await service.moderationQueue(actors[2])).items.length,0);
  }
});
test("concurrent same UUID is one insert; different payload/target reuse conflicts",async()=>{
  const v=comment();const results=await Promise.all([service.createComment(actors[0],v),service.createComment(actors[0],v)]);
  assert.equal(results[0].item.id,results[1].item.id);assert.deepEqual(results.map(r=>r.replay).sort(),[false,true]);
  assert.equal((await service.listComments(target)).visibleCount,1);
  await assert.rejects(service.createComment(actors[0],{...v,body:"Different"}),code(409));
  await assert.rejects(service.createComment(actors[0],{...v,comicId:books[1]}),code(409));
  assert.equal((await pool.query("SELECT post_count FROM community_comment_restrictions WHERE user_id=$1",[actors[0].userId])).rows[0].post_count,1);
});
test("distributed post interval, concurrent different keys, hourly quota and expired window reset",async()=>{
  const results=await Promise.allSettled([service.createComment(actors[0],comment("A")),service.createComment(actors[0],comment("B"))]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  const failure=results.find(r=>r.status==="rejected");assert.ok(failure?.status==="rejected"&&code(429)(failure.reason));
  await allowPost();
  await pool.query("UPDATE community_comment_restrictions SET post_count=20,post_window_at=clock_timestamp() WHERE user_id=$1",[actors[0].userId]);
  await assert.rejects(service.createComment(actors[0],comment()),(e:unknown)=>e instanceof CommunityError&&e.status===429&&e.retryAfter!>0);
  await pool.query("UPDATE community_comment_restrictions SET post_window_at=clock_timestamp()-interval '61 minutes' WHERE user_id=$1",[actors[0].userId]);
  await service.createComment(actors[0],comment());
  assert.equal((await pool.query("SELECT post_count FROM community_comment_restrictions WHERE user_id=$1",[actors[0].userId])).rows[0].post_count,1);
});
test("report uniqueness, own/deleted refusals, report quota and expiry",async()=>{
  const ids:number[]=[];
  for(let i=0;i<6;i++){await allowPost();ids.push((await service.createComment(actors[0],comment())).item.id);}
  await assert.rejects(service.reportComment(actors[0],ids[0],{reason:"SPAM"}),code(400));
  for(const id of ids.slice(0,5))await service.reportComment(actors[1],id,{reason:"SPAM"});
  assert.equal((await service.reportComment(actors[1],ids[0],{reason:"OTHER"})).replay,true);
  await assert.rejects(service.reportComment(actors[1],ids[5],{reason:"SPAM"}),code(429));
  await pool.query("UPDATE community_comment_restrictions SET report_window_at=clock_timestamp()-interval '11 minutes' WHERE user_id=$1",[actors[1].userId]);
  await service.reportComment(actors[1],ids[5],{reason:"SPOILER"});
  await service.deleteComment(actors[0],ids[5]);await assert.rejects(service.reportComment(actors[3],ids[5],{reason:"SPAM"}),code(409));
});
test("ADMIN-only hide/restore/resolve/reject audit; no hidden edit or author-deleted restore",async()=>{
  const row=(await service.createComment(actors[0],comment("Original private audit sentinel"))).item;
  await service.reportComment(actors[1],row.id,{reason:"INSULT",note:row.body});
  for(const actor of [actors[0],actors[1],actors[3]]){
    await assert.rejects(service.moderationQueue(actor),code(403));
    await assert.rejects(service.moderate(actor,{action:"HIDE",commentId:row.id,reason:"review"}),code(403));
  }
  const report=(await service.moderationQueue(actors[2])).items[0];
  assert.ok(report);assert.equal(report.commentId,row.id);
  assert.doesNotMatch(JSON.stringify(report),/reporterUserId|passwordHash|example.invalid/);
  await service.moderate(actors[2],{action:"HIDE",commentId:row.id,reason:"Reviewed"});
  assert.equal((await service.listComments(target)).items[0].body,null);
  await assert.rejects(service.editComment(actors[0],row.id,{body:"unhide",spoiler:false}),code(409));
  await assert.rejects(service.deleteComment(actors[0],row.id),code(409));
  await service.moderate(actors[2],{action:"RESTORE",commentId:row.id,reason:"Reviewed"});
  await service.moderate(actors[2],{action:"RESOLVE",reportId:report.id,reason:"Reviewed"});
  await service.moderate(actors[2],{action:"RESOLVE",reportId:report.id,reason:"Reviewed"});
  assert.equal((await service.moderationQueue(actors[2])).items.length,0);
  assert.equal((await service.moderationQueue(actors[2],"RESOLVED")).items.length,1);
  const audit=(await pool.query("SELECT action,actor_user_id,reason FROM community_comment_moderation_events WHERE comment_id=$1 ORDER BY id",[row.id])).rows;
  assert.deepEqual(audit.map(e=>e.action),["HIDE","RESTORE","RESOLVE"]);assert.ok(audit.every(e=>e.actor_user_id===actors[2].userId));
  assert.doesNotMatch(JSON.stringify(audit),/Original private audit sentinel/);
  await service.deleteComment(actors[0],row.id);
  assert.equal((await pool.query("SELECT note FROM community_comment_reports WHERE id=$1",[report.id])).rows[0].note,null);
  await assert.rejects(service.moderate(actors[2],{action:"RESTORE",commentId:row.id,reason:"review"}),code(409));
});
test("finite restrictions block posting/edit/report, allow reading/deletion, do not deactivate account",async()=>{
  const row=(await service.createComment(actors[0],comment())).item;
  await service.moderate(actors[2],{action:"RESTRICT",userId:actors[0].userId,until:new Date(Date.now()+3_600_000).toISOString(),reason:"Abuse"});
  await assert.rejects(service.createComment(actors[0],comment()),code(403));
  await assert.rejects(service.editComment(actors[0],row.id,{body:"x",spoiler:false}),code(403));
  await assert.rejects(service.reportComment(actors[0],row.id,{reason:"SPAM"}),code(403));
  assert.equal((await service.listComments(target)).items.length,1);
  assert.equal((await pool.query("SELECT is_active FROM users WHERE id=$1",[actors[0].userId])).rows[0].is_active,true);
  await service.deleteComment(actors[0],row.id);
  await service.moderate(actors[2],{action:"UNRESTRICT",userId:actors[0].userId,reason:"Reviewed"});await allowPost();
  await service.createComment(actors[0],comment());
  await assert.rejects(service.moderate(actors[2],{action:"RESTRICT",userId:actors[0].userId,until:new Date(Date.now()+31*86400000).toISOString(),reason:"too long"}),code(400));
  await service.moderate(actors[2],{action:"RESTRICT",userId:actors[0].userId,until:new Date(Date.now()+3_600_000).toISOString(),reason:"Again"});
  await pool.query("UPDATE community_comment_restrictions SET blocked_until=clock_timestamp()-interval '1 minute' WHERE user_id=$1",[actors[0].userId]);await allowPost();
  await service.createComment(actors[0],comment());
});
test("edit quota does not prevent an author deleting visible harmful content",async()=>{
  const row=(await service.createComment(actors[0],comment())).item;
  await pool.query("UPDATE community_comment_restrictions SET edit_count=20,edit_window_at=clock_timestamp() WHERE user_id=$1",[actors[0].userId]);
  await assert.rejects(service.editComment(actors[0],row.id,{body:"x",spoiler:false}),code(429));
  await service.deleteComment(actors[0],row.id);assert.equal((await service.listComments(target)).items[0].body,null);
});
test("rejected report stays unique and every successful moderation decision is audited atomically",async()=>{
  const row=(await service.createComment(actors[0],comment())).item;
  await service.reportComment(actors[1],row.id,{reason:"OTHER"});
  const report=(await service.moderationQueue(actors[2])).items[0];
  await service.moderate(actors[2],{action:"REJECT",reportId:report.id,reason:"No violation"});
  assert.equal((await service.moderationQueue(actors[2],"REJECTED")).items[0].id,report.id);
  assert.equal((await service.reportComment(actors[1],row.id,{reason:"SPAM"})).replay,true);
  const audit=(await pool.query("SELECT action,actor_user_id FROM community_comment_moderation_events WHERE report_id=$1",[report.id])).rows;
  assert.deepEqual(audit,[{action:"REJECT",actor_user_id:actors[2].userId}]);
  await assert.rejects(service.moderate(actors[2],{action:"RESTORE",commentId:2147483647,reason:"invalid"}),code(404));
  assert.equal((await pool.query("SELECT count(*)::int n FROM community_comment_moderation_events WHERE actor_user_id=$1",[actors[2].userId])).rows[0].n,1);
});
test("DB checks defend body/status/self-parent/UUID uniqueness even outside service code",async()=>{
  const value=comment();const row=(await service.createComment(actors[0],value)).item;
  await assert.rejects(pool.query("UPDATE community_comments SET parent_id=id WHERE id=$1",[row.id]));
  await assert.rejects(pool.query("UPDATE community_comments SET status='REMOVED_BY_AUTHOR' WHERE id=$1",[row.id]));
  await assert.rejects(pool.query("UPDATE community_comments SET body=NULL WHERE id=$1",[row.id]));
  await assert.rejects(pool.query("UPDATE community_comments SET body=repeat('x',2001) WHERE id=$1",[row.id]));
  await assert.rejects(pool.query("INSERT INTO community_comments(comic_id,author_user_id,request_id,request_digest,body) VALUES($1,$2,$3,repeat('a',64),'x')",[target.comicId,actors[0].userId,value.requestId]));
  assert.equal((await service.listComments(target)).items[0].body,value.body);
});
test("inactive/expired/revoked sessions and role changes are rechecked in database",async()=>{
  await pool.query("UPDATE users SET is_active=false WHERE id=$1",[actors[0].userId]);
  await assert.rejects(service.createComment(actors[0],comment()),code(401));
  await pool.query("UPDATE users SET is_active=true WHERE id=$1",[actors[0].userId]);
  await pool.query("UPDATE sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[actors[0].sessionId]);
  await assert.rejects(service.createComment(actors[0],comment()),code(401));
  await pool.query("DELETE FROM sessions WHERE id=$1",[actors[1].sessionId]);await assert.rejects(service.createComment(actors[1],comment()),code(401));
  await pool.query("UPDATE users SET role='EDITOR' WHERE id=$1",[actors[2].userId]);await assert.rejects(service.moderationQueue(actors[2]),code(403));
});
test("author deletion anonymizes attribution; physical target deletion cascades discussions/reports, not audit",async()=>{
  const row=(await service.createComment(actors[0],comment())).item;await service.reportComment(actors[1],row.id,{reason:"SPAM"});
  await service.moderate(actors[2],{action:"HIDE",commentId:row.id,reason:"Reviewed"});
  await pool.query("DELETE FROM users WHERE id=$1",[actors[0].userId]);
  const item=(await service.listComments(target)).items[0];assert.equal(item.author,"Читатель");assert.equal(item.body,null);
  await pool.query("DELETE FROM comics WHERE id=$1",[target.comicId]);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM community_comments WHERE id=$1",[row.id])).rows[0].n,0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM community_comment_reports WHERE comment_id=$1",[row.id])).rows[0].n,0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM community_comment_moderation_events WHERE comment_id=$1",[row.id])).rows[0].n,1);
});
test("stable tied-timestamp cursor pagination over 45 messages and moderation reports",async()=>{
  const at=new Date(Date.now()-60000);
  const rows=(await pool.query("INSERT INTO community_comments(comic_id,author_user_id,request_id,request_digest,body,created_at,updated_at) SELECT $1,$2,gen_random_uuid(),repeat('a',64),'Page '||n,$3,$3 FROM generate_series(1,45) n RETURNING id",[target.comicId,actors[0].userId,at])).rows;
  await pool.query("INSERT INTO community_comment_reports(comment_id,reporter_user_id,reason,created_at) SELECT unnest($1::int[]),$2,'SPAM',$3",[rows.map(r=>r.id),actors[1].userId,at]);
  const seen:number[]=[];let cursor:string|null=null;
  for(let i=0;i<3;i++){const p=await service.listComments(target,cursor);assert.equal(p.visibleCount,45);seen.push(...p.items.map(v=>v.id));cursor=p.nextCursor;}
  assert.equal(cursor,null);assert.equal(new Set(seen).size,45);assert.deepEqual(seen,rows.map(r=>r.id));
  const modSeen:number[]=[];cursor=null;
  for(let i=0;i<3;i++){const p=await service.moderationQueue(actors[2],"OPEN",cursor);modSeen.push(...p.items.map(v=>v.id));cursor=p.nextCursor;}
  assert.equal(cursor,null);assert.equal(new Set(modSeen).size,45);
  await assert.rejects(service.listComments(target,"bad"),code(400));
});
test("parallel edit/delete/hide/report never resurrects a hidden or removed body",async()=>{
  const row=(await service.createComment(actors[0],comment())).item;
  const results=await Promise.allSettled([service.editComment(actors[0],row.id,{body:"new",spoiler:false}),service.deleteComment(actors[0],row.id),
    service.moderate(actors[2],{action:"HIDE",commentId:row.id,reason:"review"}),service.reportComment(actors[1],row.id,{reason:"SPAM"})]);
  for(const r of results)if(r.status==="rejected")assert.ok(code(409)(r.reason));
  const item=(await service.listComments(target)).items[0];assert.notEqual(item.status,"VISIBLE");assert.equal(item.body,null);
  if(item.status==="REMOVED_BY_AUTHOR")await assert.rejects(service.moderate(actors[2],{action:"RESTORE",commentId:row.id,reason:"review"}),code(409));
});

async function waitBlocked(blocker:number,pattern:string){
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){const r=await pool.query("SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE $2",[blocker,pattern]);if(r.rows.length)return r.rows[0].pid;await new Promise(r=>setTimeout(r,10));}
  throw Error("Independent PostgreSQL lock wait not observed");
}
test("revoked session while waiting for the advisory lock cannot publish",async()=>{
  const locker=await pool.connect();let pending:Promise<unknown>|undefined;
  try{
    await locker.query("BEGIN");await locker.query("SELECT pg_advisory_xact_lock(536000001)");
    const pid=(await locker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    pending=service.createComment(actors[0],comment());void pending.catch(()=>undefined);
    await waitBlocked(pid,'%pg_advisory_xact_lock%');
    await pool.query("DELETE FROM sessions WHERE id=$1",[actors[0].sessionId]);await locker.query("COMMIT");
    await assert.rejects(pending,code(401));assert.equal((await service.listComments(target)).visibleCount,0);
  }finally{await locker.query("ROLLBACK");locker.release();if(pending)await Promise.allSettled([pending]);}
});
test("pending activation cannot use COMMUNITY mutations or moderation despite an existing session",async()=>{
  await pool.query("UPDATE users SET email_verified_at=NULL,verification_required_at=clock_timestamp() WHERE id=ANY($1::int[])",[actors.map(a=>a.userId)]);
  await assert.rejects(service.createComment(actors[0],comment()),code(401));
  await assert.rejects(service.moderationQueue(actors[2]),code(401));
  assert.equal((await service.listComments(target)).visibleCount,0);
  // Preserve AUTH's explicit legacy-user policy; NULL is not called verified.
  await pool.query("UPDATE users SET verification_required_at=NULL WHERE id=$1",[actors[0].userId]);
  await service.createComment(actors[0],comment());
});
test("activation revoked while waiting for the advisory lock cannot publish",async()=>{
  const locker=await pool.connect();let pending:Promise<unknown>|undefined;
  try{
    await locker.query("BEGIN");await locker.query("SELECT pg_advisory_xact_lock(536000001)");
    const pid=(await locker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    pending=service.createComment(actors[0],comment());void pending.catch(()=>undefined);
    await waitBlocked(pid,'%pg_advisory_xact_lock%');
    await pool.query("UPDATE users SET email_verified_at=NULL,verification_required_at=clock_timestamp() WHERE id=$1",[actors[0].userId]);
    await locker.query("COMMIT");await assert.rejects(pending,code(401));
    assert.equal((await service.listComments(target)).visibleCount,0);
  }finally{await locker.query("ROLLBACK");locker.release();if(pending)await Promise.allSettled([pending]);}
});
for(const first of ["create","restrict"] as const){
  test(`locking race: ${first} wins; no publication after committed restriction`,async()=>{
    const locker=await pool.connect();let locked=false;const pending:Promise<unknown>[]=[];
    try{
      await locker.query("BEGIN");locked=true;const pid=(await locker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await locker.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[first==="create"?actors[0].userId:actors[2].userId]);
      const ban=()=>service.moderate(actors[2],{action:"RESTRICT",userId:actors[0].userId,until:new Date(Date.now()+3600000).toISOString(),reason:"review"});
      pending.push(first==="create"?service.createComment(actors[0],comment()):ban());
      const firstPid=await waitBlocked(pid,'%"users"%');
      pending.push(first==="create"?ban():service.createComment(actors[0],comment()));
      await waitBlocked(firstPid,'%pg_advisory_xact_lock%');await locker.query("COMMIT");locked=false;
      const results=await Promise.allSettled(pending);
      assert.equal(results[0].status,"fulfilled");assert.equal(results[1].status,first==="create"?"fulfilled":"rejected");
      if(results[1].status==="rejected")assert.ok(code(403)(results[1].reason));
      assert.equal((await service.listComments(target)).visibleCount,first==="create"?1:0);
      await assert.rejects(service.createComment(actors[0],comment()),code(403));
    }finally{if(locked)await locker.query("ROLLBACK");locker.release();await Promise.allSettled(pending);}
  });
}
test("catalog row-lock wait rechecks a newly PRIVATE target before inserting",async()=>{
  const locker=await pool.connect();let pending:Promise<unknown>|undefined;
  try{
    await locker.query("BEGIN");const pid=(await locker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await locker.query("SELECT id FROM comics WHERE id=$1 FOR UPDATE",[target.comicId]);
    pending=service.createComment(actors[0],comment());void pending.catch(()=>undefined);await waitBlocked(pid,'%"comics"%');
    await locker.query("UPDATE comics SET visibility='PRIVATE',owner_user_id=$2 WHERE id=$1",[target.comicId,actors[0].userId]);await locker.query("COMMIT");
    await assert.rejects(pending,code(404));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM community_comments WHERE comic_id=$1",[target.comicId])).rows[0].n,0);
  }finally{await locker.query("ROLLBACK");locker.release();if(pending)await Promise.allSettled([pending]);}
});
test("constant list query count on 102 chapters and realistic indexed page EXPLAIN",async()=>{
  await pool.query("INSERT INTO chapters(comic_id,display_code,sort_order,status) SELECT $1,'bulk-'||n,n+10,'RELEASED' FROM generate_series(1,100)n",[target.comicId]);
  const ids=(await pool.query("SELECT id FROM chapters WHERE comic_id=$1 AND status='RELEASED' ORDER BY id",[target.comicId])).rows.map(r=>r.id);
  await pool.query("INSERT INTO community_comments(comic_id,chapter_id,author_user_id,request_id,request_digest,body) SELECT $1,($3::int[])[1+(n%102)],$2,gen_random_uuid(),repeat('a',64),'Bulk fixture' FROM generate_series(0,5099)n",[target.comicId,actors[0].userId,ids]);
  await pool.query("ANALYZE community_comments");
  const original=db.$client.connect;const calls:unknown[][]=[];
  const clients=new Map<import("pg").PoolClient,import("pg").PoolClient["query"]>();
  db.$client.connect=new Proxy(original,{apply(fn,self,args){
    return (Reflect.apply(fn,self,args) as Promise<import("pg").PoolClient>).then(client=>{
      clients.set(client,client.query);
      client.query=new Proxy(client.query,{apply(query,self,values){calls.push(values);return Reflect.apply(query,self,values);}});
      return client;
    });
  }});
  try{const p=await service.listComments({...target,chapterId:ids[0]});assert.equal(p.items.length,20);assert.equal(p.visibleCount,50);assert.ok(calls.length>=5&&calls.length<=7);}
  finally{db.$client.connect=original;for(const [client,query]of clients)client.query=query;}
  const captured=calls.find(args=>typeof args[0]==="object"&&args[0]!==null&&/from "community_comments"[\s\S]*order by/i.test((args[0] as {text:string}).text));assert.ok(captured);
  const plan=await pool.query("EXPLAIN (FORMAT JSON) "+(captured[0] as {text:string}).text,captured[1] as unknown[]);
  assert.match(JSON.stringify(plan.rows),/community_comments_target_cursor_idx/);
  if(process.env.COMMUNITY01_EXPLAIN_OUTPUT)await writeFile(process.env.COMMUNITY01_EXPLAIN_OUTPUT,JSON.stringify({boundedQueryCount:calls.length,plan:plan.rows},null,2));
});
