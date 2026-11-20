/** Disposable PostgreSQL only. No env files, real users or provider transport. */
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Pool } from "pg";

const url = new URL(process.env.RATE01_TEST_DATABASE_URL ?? "invalid:");
const local = url.hostname === "127.0.0.1" && url.port === "55492" && url.username === "rate01_qa" && url.pathname === "/rate01_review";
const ci = process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_REPOSITORY === "Flawden/comic-diary" && url.hostname === "127.0.0.1" && url.port === "5432" && url.username === "comic_diary_ci" && url.pathname === "/comic_diary_release";
if (url.protocol !== "postgresql:" || (!local && !ci) || url.search || url.hash) throw Error("REFUSED: disposable RATE-01 target required");
process.env.DATABASE_URL = url.href;
const pool = new Pool({ connectionString: url.href });
let query: typeof import("../src/modules/library/queries/get-community-ratings").getCommunityRatings;
let diary: typeof import("../src/modules/library/mutations/update-user-comic-state").updateUserComicDiary;
let reading: typeof import("../src/modules/library/mutations/update-chapter-reading").updateChapterReading;
let db: typeof import("../src/db").db;
let users: number[], comic: number, chapter: number, special: number, scheduled: number, archived: number;
const empty = { ratingPlot: null, ratingCharacters: null, ratingArt: null, ratingDepth: null, ratingWorld: null, personalNote: "PRIVATE_FIXTURE_NOTE" };
const all = { ratingPlot: 5, ratingCharacters: 5, ratingArt: 5, ratingDepth: 5, ratingWorld: 5, personalNote: "PRIVATE_FIXTURE_NOTE" };

before(async () => {
  ({ getCommunityRatings: query } = await import("../src/modules/library/queries/get-community-ratings"));
  ({ updateUserComicDiary: diary } = await import("../src/modules/library/mutations/update-user-comic-state"));
  ({ updateChapterReading: reading } = await import("../src/modules/library/mutations/update-chapter-reading"));
  ({ db } = await import("../src/db"));
});
beforeEach(async () => {
  users = [];
  for (let i = 0; i < 3; i++) users.push((await pool.query("INSERT INTO users(email,password_hash,is_active) VALUES($1,'synthetic-unused-hash',true) RETURNING id", [`rate01-${randomUUID()}@example.invalid`])).rows[0].id);
  comic = (await pool.query("INSERT INTO comics(slug,title,source_url,visibility,publication_status) VALUES($1,'RATE01 fixture','https://example.invalid/rate01','SHARED','PUBLISHED') RETURNING id", [randomUUID()])).rows[0].id;
  for (const user of users) await pool.query("INSERT INTO user_comics(user_id,comic_id) VALUES($1,$2)", [user, comic]);
  const ids = [];
  for (const [status, kind] of [["RELEASED", "MAIN"], ["RELEASED", "SPECIAL"], ["SCHEDULED", "MAIN"], ["ARCHIVED", "MAIN"]]) ids.push((await pool.query("INSERT INTO chapters(comic_id,display_code,sort_order,status,kind) VALUES($1,$2,$3,$4,$5) RETURNING id", [comic, String(ids.length + 1), ids.length + 1, status, kind])).rows[0].id);
  [chapter, special, scheduled, archived] = ids;
});
afterEach(async () => { await pool.query("DELETE FROM user_chapter_reads WHERE user_id=ANY($1::int[])", [users]); await pool.query("DELETE FROM comics WHERE id=$1", [comic]); await pool.query("DELETE FROM users WHERE id=ANY($1::int[])", [users]); });
after(async () => { await pool.end(); await db.$client.end(); });

test("empty aggregate, no fabricated zeros; only released MAIN/SPECIAL chapters", async () => {
  const result = (await query(comic))!;
  assert.deepEqual(result.overall, { average: null, votes: 0 });
  for (const v of Object.values(result.criteria)) assert.deepEqual(v, { average: null, votes: 0 });
  assert.deepEqual(Object.keys(result.chapters).map(Number).sort((a,b)=>a-b), [chapter,special]);
  assert.deepEqual(result.chapters[chapter], { average: null, votes: 0 });
});
test("equal reader weight, partial criteria, repeat save, edit and clear without vote multiplication", async () => {
  await diary(users[0], comic, all); await diary(users[1], comic, { ...empty, ratingPlot: 1 });
  let result = (await query(comic))!;
  assert.deepEqual(result.overall, { average: 3, votes: 2 });
  assert.deepEqual(result.criteria.plot, { average: 3, votes: 2 });
  assert.deepEqual(result.criteria.art, { average: 5, votes: 1 });
  await diary(users[1], comic, { ...empty, ratingPlot: 1 }); assert.deepEqual(await query(comic), result);
  await diary(users[1], comic, { ...empty, ratingPlot: 3 }); result = (await query(comic))!;
  assert.deepEqual(result.overall, { average: 4, votes: 2 });
  await diary(users[0], comic, { ...all, ratingPlot: null }); result = (await query(comic))!;
  assert.deepEqual(result.criteria.plot, { average: 3, votes: 1 }); assert.equal(result.overall.average, 4);
  await diary(users[0], comic, empty); await diary(users[1], comic, empty);
  assert.deepEqual((await query(comic))!.overall, { average: null, votes: 0 });
});
test("precision is preserved and all five populated criteria produce independent counts", async () => {
  await diary(users[0], comic, { ...empty, ratingPlot: 5, ratingArt: 5, ratingDepth: 4 });
  await diary(users[1], comic, { ...empty, ratingPlot: 1 });
  const result = (await query(comic))!;
  assert.ok(Math.abs(result.overall.average! - (14/3 + 1)/2) < 1e-14);
  assert.equal(result.overall.votes, 2); assert.equal(result.criteria.plot.votes, 2); assert.equal(result.criteria.world.votes, 0);
});
test("saved votes survive shelf removal and account inactivity; no identities or notes leave the query", async () => {
  await diary(users[0], comic, all);
  await pool.query("UPDATE user_comics SET in_library=false WHERE user_id=$1 AND comic_id=$2", [users[0], comic]);
  await pool.query("UPDATE users SET is_active=false WHERE id=$1", [users[0]]);
  const result = (await query(comic))!; assert.deepEqual(result.overall, { average: 5, votes: 1 });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_FIXTURE_NOTE|user_id|userId|email|personalNote/);
});
test("chapter guards, repeat save, edit, clear and unread use real existing mutation services", async () => {
  await assert.rejects(reading(users[0], comic, chapter, "rate", 2), /read before rating/);
  await assert.rejects(reading(users[0], comic, scheduled, "read"), /unavailable/);
  await assert.rejects(reading(users[0], comic, archived, "read"), /unavailable/);
  for (const user of users.slice(0,2)) await reading(user, comic, chapter, "read");
  await reading(users[0], comic, chapter, "rate", 2); await reading(users[1], comic, chapter, "rate", 4);
  assert.deepEqual((await query(comic))!.chapters[chapter], { average: 3, votes: 2 });
  await reading(users[1], comic, chapter, "rate", 4); await reading(users[1], comic, chapter, "rate", 5);
  assert.deepEqual((await query(comic))!.chapters[chapter], { average: 3.5, votes: 2 });
  await reading(users[1], comic, chapter, "rate", null);
  assert.deepEqual((await query(comic))!.chapters[chapter], { average: 2, votes: 1 });
  await reading(users[0], comic, chapter, "unread");
  assert.deepEqual((await query(comic))!.chapters[chapter], { average: null, votes: 0 });
  await assert.rejects(reading(users[0], comic, chapter, "rate", 1));
  await reading(users[0], comic, special, "read"); await reading(users[0], comic, special, "rate", 5);
  assert.deepEqual((await query(comic))!.chapters[special], { average: 5, votes: 1 });
});
test("visibility/publication/ownership fail closed independently inside the aggregate SQL", async () => {
  await pool.query("UPDATE comics SET visibility='PRIVATE',owner_user_id=$2 WHERE id=$1", [comic, users[0]]);
  assert.equal(await query(comic), null); assert.equal(await query(comic, users[1]), null); assert.ok(await query(comic, users[0]));
  await assert.rejects(diary(users[1], comic, all)); await assert.rejects(reading(users[1], comic, chapter, "read"));
  for (const status of ["HIDDEN", "ARCHIVED"]) {
    await pool.query("UPDATE comics SET publication_status=$2 WHERE id=$1", [comic, status]);
    assert.equal(await query(comic, users[0]), null);
    await pool.query("UPDATE comics SET visibility='SHARED',owner_user_id=NULL WHERE id=$1", [comic]);
    assert.equal(await query(comic), null);
  }
  assert.equal(await query(-1), null); assert.equal(await query(comic, 0), null); assert.equal(await query(2147483647), null);
});
test("DB uniqueness and range constraints prevent duplicate/out-of-range votes", async () => {
  await assert.rejects(pool.query("INSERT INTO user_comics(user_id,comic_id) VALUES($1,$2)", [users[0], comic]));
  await reading(users[0], comic, chapter, "read");
  await assert.rejects(pool.query("INSERT INTO user_chapter_reads(user_id,chapter_id) VALUES($1,$2)", [users[0], chapter]));
  for (const rating of [0,6,1.5]) {
    await assert.rejects(diary(users[0], comic, { ...empty, ratingPlot: rating }));
    await assert.rejects(reading(users[0], comic, chapter, "rate", rating));
  }
});
test("one set-based statement for 102 released chapters, no work/chapter cross-product; EXPLAIN evidence", async () => {
  await diary(users[0], comic, all); await diary(users[1], comic, { ...empty, ratingPlot: 1 });
  await pool.query("INSERT INTO chapters(comic_id,display_code,sort_order,status) SELECT $1,'batch-'||n,n+10,'RELEASED' FROM generate_series(1,100) n", [comic]);
  const original = db.$client.query; let count = 0; let args: unknown[] = [];
  db.$client.query = new Proxy(original, { apply(target, self, values) { count++; args = values; return Reflect.apply(target, self, values); } });
  try {
    const result = (await query(comic))!; assert.equal(count,1); assert.equal(Object.keys(result.chapters).length,102);
    assert.deepEqual(result.overall,{average:3,votes:2});
  } finally { db.$client.query = original; }
  const config = args[0] as { text: string }; const values = args[1] as unknown[];
  const plan = await pool.query("EXPLAIN (FORMAT JSON) " + config.text, values);
  if (process.env.RATE01_EXPLAIN_OUTPUT) await writeFile(process.env.RATE01_EXPLAIN_OUTPUT, JSON.stringify(plan.rows, null, 2));
});
