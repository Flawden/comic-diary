import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const read=p=>readFileSync(p,'utf8');
test('integration preserves current hero, chapter art/progress/volume controls and studio',()=>{
  const page=read('src/app/comics/[slug]/page.tsx');
  const panel=read('src/modules/library/components/ChapterReadingPanel.tsx');
  for(const feature of ['WorkDescriptionModal','WorkHeroProgress','WorkChapterProgressProvider','chapterCoverUrls','volumeTitles={volumeTitles}'])assert.ok(page.includes(feature),feature);
  for(const feature of ['wd08-timeline-marker','wd08-cover-art','manualVolumeOpen','volumeHeading','useWorkChapterProgress','getChapterReadingSource'])assert.ok(panel.includes(feature),feature);
  const studio=read('src/app/admin/comics/AdminComicManager.tsx');
  assert.ok(studio.includes('Новое произведение'));
  assert.ok(read('src/app/admin/page.tsx').includes('Добро пожаловать, хозяин!'));
});
test('COMMUNITY migration follows complete live and AUTH history without replaying AUTH DDL',()=>{
  const journal=JSON.parse(read('drizzle/meta/_journal.json')).entries;
  for(const tag of ['0028_comic_volume_titles','0029_optional_comic_source_url','0030_chapter_cover','0044_auth_password_reset_dispatch_start'])assert.ok(journal.some(e=>e.tag===tag),tag);
  assert.equal(journal[45].tag,'0045_community_comments');
  const sql=read('drizzle/0045_community_comments.sql');
  assert.equal((sql.match(/CREATE TABLE /g)??[]).length,4);
  assert.doesNotMatch(sql,/ALTER TYPE|CREATE TABLE "(?:password_reset|activation|email_verification)|DROP /);
});
test('CI keeps AUTH and adds RATE and COMMUNITY integration suites together',()=>{
  const ci=read('.github/workflows/ci.yml');
  for(const name of ['auth-dispatch-integration','rate01-integration','community01-integration'])assert.ok(ci.includes(`run: node --import tsx --test scripts/${name}.test.ts`));
  assert.ok(ci.includes('scripts/integration-design-contract.test.mjs'));
});
