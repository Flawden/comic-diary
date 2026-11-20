import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const read=p=>readFileSync(p,'utf8');
const service=read('src/modules/community/service.ts');
const http=read('src/modules/community/http.ts');
const ui=read('src/modules/community/Comments.tsx');
test('migration is additive and comments are not private diary storage',()=>{
  const migration=read('drizzle/0045_community_comments.sql');
  assert.equal((migration.match(/CREATE TABLE /g)??[]).length,4);
  assert.doesNotMatch(migration,/DROP |ALTER TABLE "(?:users|comics|chapters|user_comics|user_chapter_reads)"/);
  assert.match(migration,/UNIQUE\("author_user_id","request_id"\)/);
  assert.match(migration,/community_comments_body_check/);assert.match(migration,/community_reports_reporter_unique/);
  const journal=JSON.parse(read('drizzle/meta/_journal.json'));assert.equal(journal.entries[45].tag,'0045_community_comments');
});
test('write lock/identity/access/quota remain server-side, no caller authorization token',()=>{
  const start=service.indexOf('async function mutate');const body=service.slice(start,service.indexOf('function requireUnrestricted',start));
  assert.ok(body.indexOf('pg_advisory_xact_lock')<body.indexOf('.from(users)'));
  assert.match(body,/eq\(sessions.id, actor.sessionId\)/);assert.match(body,/account.expiresAt.getTime\(\) <= now.getTime\(\)/);
  assert.match(body,/hasPermission\(account.role, "ADMIN_SECURITY"\)/);
  assert.match(body,/canUseFullAccountSession/);
  assert.match(body,/verificationRequiredAt: users.verificationRequiredAt/);
  assert.match(service,/eq\(comics.visibility, "SHARED"\)/);assert.match(service,/eq\(comics.publicationStatus, "PUBLISHED"\)/);
  assert.match(service,/eq\(chapters.status, "RELEASED"\)/);assert.match(service,/\.for\("share"\)/);
  assert.doesNotMatch(service,/sendAuthorized|fetch\(|personalNote|passwordHash|users\.email\b/);
});
test('HTTP origin rejection is before body/session; bounded streams and sanitized errors',()=>{
  const mutation=http.slice(http.indexOf('async function mutation'),http.indexOf('export function commentsGet'));
  assert.ok(mutation.indexOf('isSameOriginRequest')<mutation.indexOf('readBoundedJson'));
  assert.ok(mutation.indexOf('readBoundedJson')<mutation.indexOf('identity()'));
  assert.match(http,/size > COMMUNITY_LIMITS.bodyBytes/);assert.match(http,/reader.cancel/);
  assert.match(http,/new CommunityError\(503, "unavailable"\)/);assert.doesNotMatch(http,/console\.|error.message/);
  assert.match(http,/private, no-store/);
});
test('public redaction, terminal tombstone and moderation audit are explicit',()=>{
  assert.match(service,/body: row.status === "VISIBLE" \? row.body : null/);
  assert.match(service,/body: null, spoiler: false, status: "REMOVED_BY_AUTHOR"/);
  assert.match(service,/update\(reports\).set\(\{ note: null \}\)/);
  assert.match(service,/row.status === "REMOVED_BY_AUTHOR"\) conflict\(\)/);
  assert.match(service,/insert\(events\).values/);
  assert.doesNotMatch(service.slice(service.indexOf('insert(events)')),/body: row.body/);
});
test('spoilers have conditional DOM content, all message text is escaped React text',()=>{
  assert.match(ui,/\(!item.spoiler \|\| revealed\) && <p/);
  assert.match(ui,/aria-expanded=\{revealed\}/);assert.match(ui,/\{item.body\}<\/p>/);
  assert.doesNotMatch(ui,/dangerouslySetInnerHTML|innerHTML|DOMParser|marked\(/);
  assert.match(ui,/community-comment-\$\{item.parentId\}/);
  assert.match(ui,/Ответ на исходное сообщение/);
  assert.match(ui,/retry.current.requestId/);assert.match(ui,/lock.current/);
});
test('one selected chapter panel, no discussion fetching inside chapter row map',()=>{
  const panel=read('src/modules/library/components/ChapterReadingPanel.tsx');
  const render=panel.slice(panel.indexOf('function renderChapter'),panel.indexOf('\n  return (',panel.indexOf('function renderChapter')));
  assert.doesNotMatch(render,/<Comments|fetch\(/);assert.match(render,/c.status === "RELEASED"/);
  assert.equal((panel.match(/<Comments /g)??[]).length,1);
  const page=read('src/app/comics/[slug]/page.tsx');
  assert.match(page,/comic.visibility === "SHARED" && comic.publicationStatus === "PUBLISHED" && <Comments/);
  assert.match(page,/<CommunityRatings/);
});
test('CI runs new unit/contracts and entire guarded PG suite',()=>{
  const ci=read('.github/workflows/ci.yml');
  assert.match(ci,/node --import tsx --test src\/modules\/community\/policy.test.ts scripts\/community01-contract.test.mjs/);
  assert.match(ci,/run: node --import tsx --test scripts\/community01-integration.test.ts/);
  assert.match(ci,/run: node --import tsx --test scripts\/rate01-integration.test.ts/);
});
test('RSC refresh revalidates public and moderation data without key-remounting drafts',()=>{
  const page=read('src/app/comics/[slug]/page.tsx');
  const admin=read('src/app/admin/community/Moderation.tsx');
  assert.match(page,/commentsRefreshToken = randomUUID\(\)/);
  assert.match(page,/refreshToken=\{commentsRefreshToken\}/);
  assert.match(ui,/\[base, refreshToken\]/);assert.match(admin,/\[base, refreshToken\]/);
  assert.match(ui,/if \(abort.signal.aborted\) return/);
  assert.match(ui,/item.status === "VISIBLE" && edit\?\.id === item.id/);
  assert.match(read('src/app/admin/community/page.tsx'),/refreshToken=\{randomUUID\(\)\}/);
  assert.doesNotMatch(page,/<Comments key=\{commentsRefreshToken\}/);
});
test('thread previews are batched and reply pagination/grouping regressions run in CI',()=>{
  assert.match(service,/inArray\(comments.parentId, page.map/);
  assert.match(service,/row_number\(\) OVER \(PARTITION BY/);
  assert.match(service,/isNull\(comments.parentId\) : eq\(comments.parentId, parentId\)/);
  assert.match(ui,/data-thread=\{root.id\}/);assert.match(ui,/className="community-replies"/);
  assert.match(ui,/&parentId=\$\{root.id\}/);
  assert.match(read('.github/workflows/ci.yml'),/node --import tsx --test src\/modules\/community\/thread-model.test.ts/);
});
