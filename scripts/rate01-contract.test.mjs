import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const read = path => readFileSync(path, 'utf8');
const query = read('src/modules/library/queries/get-community-ratings.ts');
const page = read('src/app/comics/[slug]/page.tsx');
const panel = read('src/modules/library/components/ChapterReadingPanel.tsx');
test('aggregate has a server-side publication/ownership boundary and no voter payload', () => {
  assert.match(query, /publication_status = 'PUBLISHED'/);
  assert.match(query, /visibility = 'PRIVATE' AND owner_user_id = \$\{viewerUserId\}/);
  assert.match(query, /WHERE c.status = 'RELEASED'/);
  assert.doesNotMatch(query, /personal_note|email|is_active|in_library/);
  assert.equal((query.match(/db.execute/g) ?? []).length, 1);
  assert.match(query, /GROUP BY c.id/);
});
test('dynamic page checks access before aggregation, passes only summaries and preserves personal controls', () => {
  assert.ok(page.indexOf('notFound();') < page.indexOf('await getCommunityRatings'));
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(page, /communityRatings=\{communityRatings\?\.chapters \?\? \{\}\}/);
  assert.match(page, /<DiaryRatingFields/);
  assert.match(panel, /!isScheduled && communityRatings\[c.id\]/);
  assert.match(panel, /<ChapterRating/);
  assert.match(panel, /router.refresh\(\)/);
});
test('CI runs rating unit/contracts and the entire disposable PG suite', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /node --import tsx --test src\/modules\/library\/ratings\/community-rating.test.ts scripts\/rate01-contract.test.mjs/);
  assert.match(ci, /run: node --import tsx --test scripts\/rate01-integration.test.ts/);
});
