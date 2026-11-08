import "dotenv/config";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  chapters,
  comics,
  userChapterReads,
  userComics,
  users,
} from "../src/db/schema";
import {
  addComicToUserLibrary,
  removeComicFromUserLibrary,
} from "../src/modules/library/mutations/update-user-comic-state";
import { getUserLibrary } from "../src/modules/library/queries/get-user-library";
import { getUserComicState } from "../src/modules/library/queries/get-user-comic-state";
import {
  getReadingUpdates,
  getUnreadChapters,
} from "../src/modules/library/queries/get-reading-updates";
import { getUserReadingStats } from "../src/modules/library/queries/get-user-reading-stats";

async function main() {
  db.$client.options.max = 1;
  if (process.env.COMIC_DIARY_TEST_ADAPTER) {
    const harness = await import(process.env.COMIC_DIARY_TEST_ADAPTER);
    await harness.attach(db.$client);
  }

  const stamp = `library-membership-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let userId: number | null = null;
  let comicId: number | null = null;

  try {
    const [user] = await db.insert(users).values({
      email: `${stamp}@test.invalid`,
    }).returning();
    userId = user.id;

    const [comic] = await db.insert(comics).values({
      slug: stamp,
      title: "Library membership probe",
      sourceUrl: "https://example.com/library-membership-probe",
      totalChapters: 2,
    }).returning();
    comicId = comic.id;

    const chapterRows = await db.insert(chapters).values([
      {
        comicId: comic.id,
        displayCode: "1",
        sortOrder: 10,
        status: "RELEASED",
        kind: "MAIN",
      },
      {
        comicId: comic.id,
        displayCode: "2",
        sortOrder: 20,
        status: "RELEASED",
        kind: "MAIN",
      },
    ]).returning();

    await addComicToUserLibrary(user.id, comic.id);
    await db.update(userComics).set({
      status: "READING",
      currentChapter: 1,
      ratingPlot: 5,
      personalNote: "This note must survive removal.",
      trackingEnabled: true,
    }).where(eq(userComics.userId, user.id));
    await db.insert(userChapterReads).values({
      userId: user.id,
      chapterId: chapterRows[0].id,
    });

    const [originalRow] = await db.select({ id: userComics.id })
      .from(userComics)
      .where(eq(userComics.userId, user.id));

    const initialLibrary = await getUserLibrary(user.id);
    assert.equal(initialLibrary.length, 1, "new membership must appear on the shelf");
    assert.equal(initialLibrary[0]?.status, "READING");
    assert.equal(initialLibrary[0]?.personalNote, "This note must survive removal.");

    const initialState = await getUserComicState(user.id, comic.id);
    assert.ok(initialState);
    assert.equal(initialState.inLibrary, true);
    assert.equal(initialState.ratingPlot, 5);
    assert.deepEqual(initialState.chapterReading.readIds, [chapterRows[0].id]);

    const initialUpdates = await getReadingUpdates(user.id, {
      kind: "ALL",
      status: "ALL",
      q: "",
      page: 1,
    });
    assert.equal(initialUpdates.titles.length, 1, "active tracked membership must appear in updates");
    assert.equal(initialUpdates.total, 1);
    assert.equal((await getUnreadChapters(user.id, comic.id, "ALL", 0)).total, 1);

    const initialStats = await getUserReadingStats(user.id);
    assert.equal(initialStats.titles, 1);
    assert.equal(initialStats.tracked, 1);
    assert.equal(initialStats.reading, 1);
    assert.equal(initialStats.main, 1);

    await removeComicFromUserLibrary(user.id, comic.id);
    await removeComicFromUserLibrary(user.id, comic.id);

    assert.equal((await getUserLibrary(user.id)).length, 0, "removed title must disappear from the shelf");

    const retainedState = await getUserComicState(user.id, comic.id);
    assert.ok(retainedState, "diary row must remain available after removal");
    assert.equal(retainedState.inLibrary, false);
    assert.equal(retainedState.status, "READING");
    assert.equal(retainedState.currentChapter, 1);
    assert.equal(retainedState.ratingPlot, 5);
    assert.equal(retainedState.personalNote, "This note must survive removal.");
    assert.equal(retainedState.trackingEnabled, true, "tracking preference must be retained");
    assert.deepEqual(retainedState.chapterReading.readIds, [chapterRows[0].id]);

    const removedUpdates = await getReadingUpdates(user.id, {
      kind: "ALL",
      status: "ALL",
      q: "",
      page: 1,
    });
    assert.equal(removedUpdates.titles.length, 0, "removed title must leave the updates list");
    assert.equal(removedUpdates.total, 0);
    assert.equal((await getUnreadChapters(user.id, comic.id, "ALL", 0)).total, 0);

    const removedStats = await getUserReadingStats(user.id);
    assert.equal(removedStats.titles, 0, "account library count must exclude removed titles");
    assert.equal(removedStats.tracked, 0);
    assert.equal(removedStats.reading, 0);
    assert.equal(removedStats.main, 1, "reading history statistics must retain old chapter marks");

    await addComicToUserLibrary(user.id, comic.id);

    const restoredLibrary = await getUserLibrary(user.id);
    assert.equal(restoredLibrary.length, 1, "re-adding must restore the same diary row to the shelf");
    assert.equal(restoredLibrary[0]?.status, "READING");
    assert.equal(restoredLibrary[0]?.currentChapter, 1);
    assert.equal(restoredLibrary[0]?.ratingPlot, 5);
    assert.equal(restoredLibrary[0]?.personalNote, "This note must survive removal.");
    assert.equal(restoredLibrary[0]?.trackingEnabled, true);

    const restoredState = await getUserComicState(user.id, comic.id);
    assert.ok(restoredState);
    assert.equal(restoredState.inLibrary, true);
    assert.deepEqual(restoredState.chapterReading.readIds, [chapterRows[0].id]);

    const [restoredRow] = await db.select({ id: userComics.id })
      .from(userComics)
      .where(eq(userComics.userId, user.id));
    assert.equal(restoredRow?.id, originalRow?.id, "re-add must reactivate the existing row, not create a new diary");

    const restoredUpdates = await getReadingUpdates(user.id, {
      kind: "ALL",
      status: "ALL",
      q: "",
      page: 1,
    });
    assert.equal(restoredUpdates.titles.length, 1, "re-added tracked title must return to updates");

    const restoredStats = await getUserReadingStats(user.id);
    assert.equal(restoredStats.titles, 1);
    assert.equal(restoredStats.tracked, 1);
    assert.equal(restoredStats.main, 1);

    console.log("LIBRARY_MEMBERSHIP_SOFT_REMOVE=PASS");
    console.log("LIBRARY_MEMBERSHIP_DIARY_PRESERVATION=PASS");
    console.log("LIBRARY_MEMBERSHIP_UPDATE_FEED=PASS");
    console.log("LIBRARY_MEMBERSHIP_REACTIVATION=PASS");
  } finally {
    if (userId !== null) {
      await db.delete(userChapterReads).where(eq(userChapterReads.userId, userId));
    }
    if (comicId !== null) {
      await db.delete(comics).where(eq(comics.id, comicId));
    }
    if (userId !== null) {
      await db.delete(users).where(eq(users.id, userId));
    }
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
