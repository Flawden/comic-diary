/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS runs through Node stdin in the isolated Docker app. */
// Run only inside the disposable app started by CHECK_COMIC_DIARY_FULL_RESTORE.sh.
// Creates short-lived sessions in the isolated restored DB, never prints tokens/data.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

function verifyIsolation(env) {
  assert.equal(env.CD07_ISOLATED_RESTORE, 'true', 'isolated restore marker required');
  const url = new URL(env.DATABASE_URL);
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, 'restore-db');
  assert.equal(url.pathname, '/restore_probe');
  assert.equal(url.username, 'restore_probe');
  assert(!url.search && !url.hash, 'unexpected DB connection options');
}

function verifyExport(actual, expected, marks) {
  assert.equal(actual.format, 'comic-diary');
  assert.equal(actual.schemaVersion, 1);
  assert(Array.isArray(actual.entries));
  assert.deepEqual(actual.entries.map(e => e.comic.id).sort((a, b) => a - b), expected.map(e => e.id).sort((a, b) => a - b));
  for (const row of expected) {
    const entry = actual.entries.find(e => e.comic.id === row.id);
    assert.equal(entry.comic.title, row.title);
    assert.equal(entry.diary.status, row.status);
    assert.equal(entry.diary.trackingEnabled, row.tracking_enabled);
    assert.equal(entry.diary.storedCurrentChapter, row.current_chapter);
    assert.equal(entry.diary.personalNote, row.personal_note);
    assert.deepEqual(entry.diary.ratings, { plot: row.rating_plot, characters: row.rating_characters,
      art: row.rating_art, depth: row.rating_depth, world: row.rating_world });
    const expectedMarks = marks.filter(m => m.comic_id === row.id);
    assert.deepEqual(entry.chapterMarks.map(m => m.chapterId).sort((a,b)=>a-b), expectedMarks.map(m=>m.chapter_id).sort((a,b)=>a-b));
    for (const mark of expectedMarks) {
      const exported = entry.chapterMarks.find(m=>m.chapterId === mark.chapter_id);
      assert.equal(exported.kind, mark.kind);
      assert.equal(exported.status, mark.status);
      assert.equal(exported.origin, mark.origin);
      assert.equal(new Date(exported.markedAt).getTime(), new Date(mark.read_at).getTime());
    }
    assert(!('email' in entry) && !('tokenHash' in entry) && !('passwordHash' in entry));
  }
}

async function run() {
  verifyIsolation(process.env);
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let checkedUsers = 0, checkedTitles = 0, checkedMarks = 0;
  try {
    assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, 'restore_probe');
    const { rows: users } = await client.query(`SELECT u.id FROM users u WHERE u.is_active
      AND EXISTS (SELECT 1 FROM user_comics uc JOIN comics c ON c.id=uc.comic_id
        WHERE uc.user_id=u.id AND (c.visibility='SHARED' OR c.owner_user_id=u.id)) ORDER BY u.id LIMIT 5`);
    assert(users.length > 0, 'no active restored account with diary; authenticated coverage not exercised');
    for (const user of users) {
      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      let created = false;
      try {
        await client.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '15 minutes')", [user.id, tokenHash]);
        created = true;
        const get = path => fetch('http://127.0.0.1:3000'+path, {
          headers: {Cookie: 'comic_diary_session='+token}, redirect:'manual', signal:AbortSignal.timeout(30000) });
        for (const path of ['/account','/library','/updates']) {
          const response = await get(path);
          assert.equal(response.status, 200, 'authenticated restored page status');
          assert((await response.text()).includes('<h1'), 'authenticated page markup');
        }
        const response = await get('/api/account/export');
        assert.equal(response.status, 200);
        assert(response.headers.get('cache-control')?.includes('no-store'));
        assert(response.headers.get('content-disposition')?.startsWith('attachment;'));
        const actual = await response.json();
        const { rows: expected } = await client.query(`SELECT c.id,c.title,uc.status,uc.tracking_enabled,uc.current_chapter,uc.personal_note,
          uc.rating_plot,uc.rating_characters,uc.rating_art,uc.rating_depth,uc.rating_world FROM user_comics uc
          JOIN comics c ON c.id=uc.comic_id WHERE uc.user_id=$1
          AND (c.visibility='SHARED' OR (c.visibility='PRIVATE' AND c.owner_user_id=$1)) ORDER BY c.id`, [user.id]);
        const { rows: marks } = await client.query(`SELECT ch.comic_id,m.chapter_id,ch.kind,ch.status,m.origin,m.read_at
          FROM user_chapter_reads m JOIN chapters ch ON ch.id=m.chapter_id WHERE m.user_id=$1`, [user.id]);
        verifyExport(actual, expected, marks);
        const work = await client.query(`SELECT slug FROM comics WHERE id=$1`, [expected[0].id]);
        const detail = await get('/comics/'+encodeURIComponent(work.rows[0].slug));
        assert.equal(detail.status, 200); await detail.arrayBuffer();
        checkedUsers++; checkedTitles += expected.length;
        checkedMarks += actual.entries.reduce((sum,e)=>sum+e.chapterMarks.length,0);
      } finally {
        if (created) await client.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash]);
      }
    }
  } finally { await client.end(); }
  console.log('AUTHENTICATED_RESTORED_DIARY=PASS; accounts='+checkedUsers+'; entries='+checkedTitles+'; marks='+checkedMarks);
  console.log('RESTORED_DIARY_VALUES=PASS; status, tracking, numeric progress, all ratings, notes and chapter marks match SQL');
  console.log('AUTHENTICATED_BROWSER_INTERACTIONS=NOT_TESTED; HTTP render/export check only');
}

module.exports = { verifyIsolation, verifyExport };
if (require.main === module) run().catch(() => {
  // Assertion values can include private notes or session information: never print the error.
  console.error('AUTHENTICATED_RESTORED_DIARY=FAIL; inspect isolated setup/schema or missing fixture coverage');
  process.exitCode=1;
});
