import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('0049 is additive, unique per object/user, strict score shape and chapter binding',()=>{
 const sql=read('drizzle/0049_reviews_and_reactions.sql');assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE|DELETE FROM|UPDATE users)\b/i);
 for(const name of ['community_reviews_work_user_unique','community_reviews_chapter_user_unique','community_reviews_scores_check','community_review_reactions_value_check','community_reviews_chapter_binding_fk'])assert.ok(sql.includes(name));
 assert.ok(sql.indexOf('chapters_id_comic_review_unique')<sql.indexOf('community_reviews_chapter_binding_fk'));
 const j=JSON.parse(read('drizzle/meta/_journal.json')).entries;assert.equal(j[49].tag,'0049_reviews_and_reactions');assert.equal(j[49].idx,49);assert.ok(j[49].when>j[48].when);
});
test('new reviews expose no reply API, page uses fourth tab and chapter modal',()=>{
 assert.match(read('src/modules/library/components/WorkControls.tsx'),/\["reviews","Отзывы и комментарии"\]/);
 const panel=read('src/modules/library/components/ChapterReadingPanel.tsx');assert.match(panel,/<ChapterReviewsDialog/);assert.doesNotMatch(panel,/<Comments\b/);
 const ui=read('src/modules/community/Reviews.tsx');assert.doesNotMatch(ui,/dangerouslySetInnerHTML|parentId|onReply/);assert.ok(ui.includes('/reaction'));
 assert.match(read('src/modules/community/ReviewDialog.tsx'),/onCancel/);assert.match(read('src/modules/community/ReviewDialog.tsx'),/Есть несохранённые изменения/);
 assert.match(read('src/modules/community/reviews.css'),/var\(--primary\)/);assert.doesNotMatch(read('src/modules/community/reviews.css'),/#[0-9a-fA-F]{3,8}\b/);
});

test('CI executes review policy, migration, PG and browser acceptance',()=>{const ci=read('.github/workflows/ci.yml');for(const file of ['review-policy.test.ts','reviews-contract.test.mjs','reviews-integration.test.ts','reviews-migration.test.ts','reviews-browser.mjs'])assert.ok(ci.includes(file));assert.match(read('src/modules/community/review-service.ts'),/communityModerationEvents/);});

test('acceptance: removal clears reactions in transaction, hidden controls are symmetrical and audit is linked',()=>{
 const service=readFileSync('src/modules/community/review-service.ts','utf8');assert.ok(service.includes('await c.tx.delete(reactions).where(eq(reactions.reviewId,id));await c.tx.update(reviews).set({deletedAt:'));
 const ui=readFileSync('src/modules/community/Reviews.tsx','utf8');assert.equal(ui.split('disabled={!canWrite||pending||review.hidden}').length-1,2);
 const audit=readFileSync('src/modules/community/service.ts','utf8');assert.ok(audit.includes('reviewId: events.reviewId, actorUserId: events.actorUserId'));assert.ok(audit.includes('eq(events.reviewId, options.reviewId)'));assert.ok(audit.includes('nextAuditCursor:'));
});
