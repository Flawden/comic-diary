import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { chapters, comics, userChapterReads, userComics, users } from "../src/db/schema";
import { updateChapterReading } from "../src/modules/library/mutations/update-chapter-reading";
import { getChapterReading } from "../src/modules/library/queries/get-chapter-reading";
import { chapterRatingSummary } from "../src/modules/library/chapter-rating-summary";
import { exportUserDiary } from "../src/modules/library/queries/export-user-diary";

async function main() {
  const ids: number[] = [], titles: number[] = [];
  const prefix = randomUUID();
  try {
    const [a,b] = await db.insert(users).values([1,2].map(i=>({email:prefix+i+"@test.invalid"}))).returning();
    ids.push(a.id,b.id);
    const [book, secret] = await db.insert(comics).values([
      {slug:prefix,title:"Shared",sourceUrl:"https://example.com"},
      {slug:prefix+"-b",title:"Private",sourceUrl:"https://example.com",visibility:"PRIVATE",ownerUserId:b.id},
    ]).returning();
    titles.push(book.id,secret.id);
    await db.insert(userComics).values([{userId:a.id,comicId:book.id},{userId:b.id,comicId:book.id},{userId:b.id,comicId:secret.id}]);
    const [old,special,privateCh] = await db.insert(chapters).values([
      {comicId:book.id,displayCode:"1",sortOrder:1,status:"RELEASED"},
      {comicId:book.id,displayCode:"Extra",sortOrder:2,kind:"SPECIAL",status:"RELEASED"},
      {comicId:secret.id,displayCode:"1",sortOrder:1,status:"RELEASED"},
    ]).returning();
    const rate = (user:number, chapter:number, value:number|null) => updateChapterReading(user,book.id,chapter,"rate",value);
    await assert.rejects(rate(a.id,old.id,4));
    for (const user of ids) await updateChapterReading(user,book.id,old.id,"read");
    for (const value of [0,6,2.5]) await assert.rejects(rate(a.id,old.id,value));
    await rate(a.id,old.id,4); await rate(b.id,old.id,2);
    await rate(a.id,old.id,5);
    await updateChapterReading(a.id,book.id,special.id,"read"); await rate(a.id,special.id,1);
    const state = () => getChapterReading(a.id,book.id);
    assert.equal(chapterRatingSummary(await state(),"MAIN").average,5);
    assert.equal(chapterRatingSummary(await state(),"SPECIAL").average,1);
    assert.equal((await getChapterReading(b.id,book.id)).ratings[old.id],2);
    await assert.rejects(updateChapterReading(a.id,secret.id,privateCh.id,"rate",5));
    await assert.rejects(rate(a.id,privateCh.id,4));
    await rate(a.id,old.id,null);
    assert.deepEqual(chapterRatingSummary(await state(),"MAIN"),{read:1,rated:0,average:null});
    await rate(a.id,old.id,4);
    await db.update(chapters).set({status:"ARCHIVED"}).where(eq(chapters.id,old.id));
    const [replacement] = await db.insert(chapters).values({comicId:book.id,displayCode:"1",sortOrder:1,status:"RELEASED",supersedesChapterId:old.id}).returning();
    await assert.rejects(rate(a.id,old.id,1));
    await updateChapterReading(a.id,book.id,replacement.id,"read");
    assert.deepEqual(chapterRatingSummary(await state(),"MAIN"),{read:1,rated:0,average:null});
    assert.equal((await state()).ratings[old.id],4);
    assert.equal((await exportUserDiary(a.id)).entries[0].chapterMarks.find(m=>m.chapterId===old.id)?.rating,4);
    await rate(a.id,replacement.id,3);
    await updateChapterReading(a.id,book.id,replacement.id,"unread");
    await updateChapterReading(a.id,book.id,replacement.id,"read");
    assert.equal((await state()).ratings[replacement.id],undefined);
    console.log("PASS: personal chapter scores, separation, edit/clear, archives, unread and export");
  } finally {
    if(ids.length) await db.delete(userChapterReads).where(inArray(userChapterReads.userId,ids));
    if(titles.length) await db.delete(comics).where(inArray(comics.id,titles));
    if(ids.length) await db.delete(users).where(inArray(users.id,ids));
    await db.$client.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
