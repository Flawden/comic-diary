/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS runs through Node stdin in the isolated Docker app. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {verifyIsolation,verifyExport} = require('./CHECK_COMIC_DIARY_RESTORED_DIARY.cjs');
const row = {id:7,title:'История',status:'COMPLETED',tracking_enabled:false,current_chapter:1,
  personal_note:'Чай\n雪',rating_plot:4,rating_characters:null,rating_art:5,rating_depth:null,rating_world:3};
const marks = [{comic_id:7,chapter_id:22,kind:'MAIN',status:'ARCHIVED',origin:'MANUAL',read_at:'2026-10-23T00:00:00Z'}];
const snapshot = () => ({format:'comic-diary',schemaVersion:1,entries:[{comic:{id:7,title:row.title},
  diary:{status:row.status,trackingEnabled:false,storedCurrentChapter:1,personalNote:row.personal_note,
    ratings:{plot:4,characters:null,art:5,depth:null,world:3}},
  chapterMarks:[{chapterId:22,kind:'MAIN',status:'ARCHIVED',origin:'MANUAL',markedAt:'2026-10-23T00:00:00+00:00'}]}]});
test('isolation refuses missing marker, production hostname and changed database',()=>{
  assert.doesNotThrow(()=>verifyIsolation({CD07_ISOLATED_RESTORE:'true',DATABASE_URL:'postgresql://restore_probe@restore-db:5432/restore_probe'}));
  for (const env of [
    {DATABASE_URL:'postgresql://restore_probe@restore-db/restore_probe'},
    {CD07_ISOLATED_RESTORE:'true',DATABASE_URL:'postgresql://restore_probe@db/restore_probe'},
    {CD07_ISOLATED_RESTORE:'true',DATABASE_URL:'postgresql://restore_probe@restore-db/production'},
    {CD07_ISOLATED_RESTORE:'true',DATABASE_URL:'postgresql://restore_probe@restore-db/restore_probe?host=db'},
  ]) assert.throws(()=>verifyIsolation(env));
});
test('retained entry, Unicode/null ratings and archived mark match SQL',()=>verifyExport(snapshot(),[row],marks));
test('missing/foreign entry, changed note/rating/mark or wrong format fail',()=>{
  for (const mutate of [
    x=>x.entries.pop(), x=>x.entries.push({...x.entries[0],comic:{id:99}}),
    x=>x.entries[0].diary.personalNote='changed', x=>x.entries[0].diary.ratings.art=null,
    x=>x.entries[0].chapterMarks=[], x=>x.entries[0].chapterMarks[0].status='RELEASED',
    x=>x.entries[0].chapterMarks[0].markedAt='2026-10-24',x=>x.schemaVersion=2,
    x=>x.entries[0].diary.trackingEnabled=true,
  ]) { const value=snapshot(); mutate(value);assert.throws(()=>verifyExport(value,[row],marks)); }
});
