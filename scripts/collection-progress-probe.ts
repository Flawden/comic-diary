import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { categories, comics, userComics, users } from "../src/db/schema";
import { getCollectionProgress } from "../src/modules/library/queries/get-collection-progress";

async function main() {
  // Roll back the fixture, including on assertion failure.
  const rollback = new Error("fixture complete");
  try {
    await db.transaction(async tx => {
      const slug = "probe-" + randomUUID();
      const [me, other] = await tx.insert(users).values([
        { email: slug+"@test.invalid" }, { email: slug+"-b@test.invalid" },
      ]).returning();
      const progress = (id = me.id) => getCollectionProgress(id, slug, tx);
      assert.equal(await progress(), null);
      const [category] = await tx.insert(categories).values({ slug, name: "Probe" }).returning();
      const expected = (published: number, completed: number, archivedOnShelf: number) => ({name:"Probe", published, completed, archivedOnShelf});
      assert.deepEqual(await progress(), expected(0,0,0));
      const base = { title: "Fixture", sourceUrl: "https://example.com", categoryId: category.id };
      const [done, partial, unread, archive, hidden, personal, outside] = await tx.insert(comics).values([
        {...base, slug:slug+"-done"}, {...base, slug:slug+"-partial"}, {...base, slug:slug+"-unread"},
        {...base, slug:slug+"-archive", publicationStatus:"ARCHIVED"}, {...base, slug:slug+"-hidden", publicationStatus:"HIDDEN"},
        {...base, slug:slug+"-personal", visibility:"PRIVATE", ownerUserId:me.id}, {...base, slug:slug+"-outside", categoryId:null},
      ]).returning();
      await tx.insert(userComics).values([
        ...[done,archive,hidden,personal,outside].map(c => ({userId:me.id, comicId:c.id,status:"COMPLETED" as const})),
        {userId:me.id, comicId:partial.id,status:"READING",currentChapter:99},
        {userId:other.id, comicId:unread.id,status:"COMPLETED"},
      ]);
      assert.deepEqual(await progress(), expected(3,1,1));
      assert.deepEqual(await progress(other.id), expected(3,1,0));
      await tx.update(comics).set({ publicationStatus:"ARCHIVED" }).where(eq(comics.id, done.id));
      assert.deepEqual(await progress(), expected(2,0,2));
      assert.deepEqual(await progress(other.id), expected(2,1,0));
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await db.$client.end(); }
  console.log("PASS: collection progress, empty catalog, owner isolation, archive transition, visibility and chapter independence");
}
main().catch(error => { console.error(error); process.exitCode=1; });
