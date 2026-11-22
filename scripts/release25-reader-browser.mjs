/** Two synthetic accounts, real localhost APIs, response-loss injection. Never production. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
const target = process.env.RELEASE25_TEST_DATABASE_URL;
if (!target) throw Error('Explicit disposable target required');
const db = new URL(target),
  local =
    db.hostname === '127.0.0.1' &&
    db.port === '55625' &&
    db.username === 'release25_qa' &&
    db.pathname === '/release25_review';
const ci =
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_REPOSITORY === 'Flawden/comic-diary' &&
  db.hostname === '127.0.0.1' &&
  db.port === '5432' &&
  db.username === 'comic_diary_ci' &&
  db.pathname === '/comic_diary_release';
if (db.protocol !== 'postgresql:' || (!local && !ci) || db.search || db.hash)
  throw Error('Refused database');
const origin = 'http://127.0.0.1:3106',
  pool = new Pool({ connectionString: target }),
  q = (s, v = []) => pool.query(s, v);
const { chromium } = createRequire(
  resolve(process.env.WD_BROWSER_ROOT ?? '.qa/browser-deps', 'package.json'),
)('playwright-core');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.RELEASE25_BROWSER_EXECUTABLE
    ? { executablePath: process.env.RELEASE25_BROWSER_EXECUTABLE }
    : { channel: 'chrome' }),
});
const prefix = 'release25-' + randomUUID(),
  out = resolve(
    process.env.RELEASE25_BROWSER_OUTPUT ?? '.qa/release25-browser',
  );
await mkdir(out, { recursive: true });
const result = {
  status: 'PENDING',
  checks: [],
  errors: [],
  external: [],
  screenshots: [],
};
let book, chapter;
const users = [],
  tokens = [];
const baselineB = async () =>
  JSON.stringify({
    diary: (
      await q('SELECT * FROM user_comics WHERE user_id=$1 AND comic_id=$2', [
        users[1],
        book,
      ])
    ).rows,
    reads: (
      await q(
        'SELECT * FROM user_chapter_reads WHERE user_id=$1 AND chapter_id=$2',
        [users[1], chapter],
      )
    ).rows,
    votes: (
      await q(
        'SELECT * FROM community_reviews WHERE user_id=$1 AND comic_id=$2',
        [users[1], book],
      )
    ).rows,
  });
async function context(index, theme, width) {
  const c = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: 'reduce',
  });
  await c.addCookies([
    { name: 'comic_diary_session', value: tokens[index], url: origin },
    { name: 'comic-diary-theme', value: theme, url: origin },
  ]);
  await c.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== origin) {
      result.external.push(u.origin);
      return r.abort();
    }
    return r.continue();
  });
  c.on('page', (p) => p.on('pageerror', (e) => result.errors.push(e.message)));
  return c;
}
try {
  for (let i = 0; i < 2; i++) {
    const id = (
      await q(
        "INSERT INTO users(email,password_hash,display_name,email_verified_at) VALUES($1,'synthetic-unused',$2,now()) RETURNING id",
        [prefix + '-' + i + '@example.invalid', 'Release QA ' + i],
      )
    ).rows[0].id;
    users.push(id);
    const token = randomBytes(32).toString('base64url');
    tokens.push(token);
    await q(
      "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [id, createHash('sha256').update(token).digest('hex')],
    );
  }
  book = (
    await q(
      "INSERT INTO comics(slug,title,description) VALUES($1,'Приёмка библиотеки','Синтетическая проверка двух аккаунтов') RETURNING id",
      [prefix],
    )
  ).rows[0].id;
  chapter = (
    await q(
      "INSERT INTO chapters(comic_id,display_code,title,sort_order,status,source_url,page_count) VALUES($1,'1','Одна глава',1,'RELEASED','https://example.invalid/chapter',24) RETURNING id",
      [book],
    )
  ).rows[0].id;
  for (let i = 0; i < 2; i++) {
    await q(
      "INSERT INTO user_comics(user_id,comic_id,status,current_chapter,prompt_chapter_rating,personal_note,rating_plot) VALUES($1,$2,'READING',1,false,$3,$4)",
      [users[i], book, 'PRIVATE NOTE ' + i, 4 - i],
    );
    await q(
      'INSERT INTO user_chapter_reads(user_id,chapter_id,rating) VALUES($1,$2,$3)',
      [users[i], chapter, 4 - i],
    );
    await q(
      'INSERT INTO community_reviews(comic_id,chapter_id,user_id,rating) VALUES($1,$2,$3,$4)',
      [book, chapter, users[i], 5 - i],
    );
  }
  const untouchedB = await baselineB();
  for (const [theme, width] of [
    ['tea', 1440],
    ['paper', 390],
    ['night', 320],
  ]) {
    if (
      (
        await q(
          'SELECT 1 FROM user_chapter_reads WHERE user_id=$1 AND chapter_id=$2',
          [users[0], chapter],
        )
      ).rowCount === 0
    )
      await q(
        'INSERT INTO user_chapter_reads(user_id,chapter_id,rating) VALUES($1,$2,4)',
        [users[0], chapter],
      );
    else
      await q(
        'UPDATE user_chapter_reads SET rating=4 WHERE user_id=$1 AND chapter_id=$2',
        [users[0], chapter],
      );
    await q(
      'UPDATE user_comics SET in_library=true,current_chapter=1 WHERE user_id=$1 AND comic_id=$2',
      [users[0], book],
    );
    const c = await context(0, theme, width),
      p = await c.newPage();
    p.setDefaultTimeout(20000);
    try {
      await p.goto(origin + '/comics/' + prefix, { waitUntil: 'networkidle' });
      const row = p.locator('.wd08-row').filter({ hasText: 'Одна глава' });
      await row.getByRole('button', { name: /Снять отметку:/ }).click();
      const dialog = p.getByRole('dialog', {
        name: 'Снять отметку прочтения?',
      });
      await dialog.getByText(/личную оценку дневника/).waitFor();
      await dialog.getByText(/Публичная оценка главы сохранится/).waitFor();
      await p.screenshot({
        path: resolve(out, `${theme}-${width}-unread-warning.png`),
      });
      result.screenshots.push(`${theme}-${width}-unread-warning.png`);
      await dialog
        .getByRole('button', { name: 'Отмена, оставить прочитанной' })
        .click();
      assert.equal(
        (
          await q(
            'SELECT rating FROM user_chapter_reads WHERE user_id=$1 AND chapter_id=$2',
            [users[0], chapter],
          )
        ).rows[0].rating,
        4,
      );
      await row.getByRole('button', { name: /Снять отметку:/ }).click();
      const unmarked = p.waitForResponse(
        (r) =>
          r.url() === origin + '/api/library/reading-state' &&
          r.request().method() === 'POST' &&
          r.request().postData()?.includes('action=unread'),
      );
      await dialog
        .getByRole('button', {
          name: 'Снять отметку и удалить личную оценку',
          exact: true,
        })
        .click();
      assert.equal((await unmarked).status(), 200);
      await row
        .getByRole('button', { name: /Отметить прочитанной:/ })
        .waitFor();
      assert.equal(
        (
          await q(
            'SELECT 1 FROM user_chapter_reads WHERE user_id=$1 AND chapter_id=$2',
            [users[0], chapter],
          )
        ).rowCount,
        0,
      );
      assert.equal(
        (
          await q(
            'SELECT rating FROM community_reviews WHERE user_id=$1 AND chapter_id=$2',
            [users[0], chapter],
          )
        ).rows[0].rating,
        5,
      );
      assert.equal(await baselineB(), untouchedB);
      const marked = p.waitForResponse(
        (r) =>
          r.url() === origin + '/api/library/reading-state' &&
          r.request().method() === 'POST' &&
          r.request().postData()?.includes('action=read'),
      );
      await row.getByRole('button', { name: /Отметить прочитанной:/ }).click();
      assert.equal((await marked).status(), 200);
      await row.getByRole('button', { name: /Снять отметку:/ }).waitFor();
      const history = (
        await q(
          'SELECT * FROM user_chapter_reads WHERE user_id=$1 AND chapter_id=$2',
          [users[0], chapter],
        )
      ).rows[0];
      assert.equal(history.rating, null);
      const diaryBefore = (
        await q(
          'SELECT personal_note,rating_plot,status,tracking_enabled FROM user_comics WHERE user_id=$1 AND comic_id=$2',
          [users[0], book],
        )
      ).rows[0];
      const removal = p.locator('.library-remove-control.is-work');
      await removal
        .getByRole('button', { name: 'Убрать из библиотеки', exact: true })
        .click();
      await p.route(
        '**/api/library/reading-state',
        (r) =>
          r.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"error":"synthetic outage"}',
          }),
        { times: 1 },
      );
      await removal.locator('[data-action="confirm"]').click();
      await removal.getByRole('alert').waitFor();
      assert.equal(
        (
          await q(
            'SELECT in_library FROM user_comics WHERE user_id=$1 AND comic_id=$2',
            [users[0], book],
          )
        ).rows[0].in_library,
        true,
      );
      await removal.locator('[data-action="cancel"]').click();
      await p.reload({ waitUntil: 'networkidle' });
      await removal
        .getByRole('button', { name: 'Убрать из библиотеки', exact: true })
        .click();
      await p.route(
        '**/api/library/reading-state',
        async (r) => {
          const response = await r.fetch();
          assert.equal(response.status(), 200);
          await r.abort('connectionreset');
        },
        { times: 1 },
      );
      await removal.locator('[data-action="confirm"]').click();
      await removal
        .getByRole('alert')
        .filter({ hasText: /подтверждение/ })
        .waitFor();
      assert.equal(
        (
          await q(
            'SELECT in_library FROM user_comics WHERE user_id=$1 AND comic_id=$2',
            [users[0], book],
          )
        ).rows[0].in_library,
        false,
      );
      await p.reload({ waitUntil: 'networkidle' });
      await p.getByRole('button', { name: /Вернуть в библиотеку/ }).waitFor();
      assert.deepEqual(
        (
          await q(
            'SELECT personal_note,rating_plot,status,tracking_enabled FROM user_comics WHERE user_id=$1 AND comic_id=$2',
            [users[0], book],
          )
        ).rows[0],
        diaryBefore,
      );
      assert.deepEqual(
        (
          await q(
            'SELECT * FROM user_chapter_reads WHERE user_id=$1 AND chapter_id=$2',
            [users[0], chapter],
          )
        ).rows[0],
        history,
      );
      assert.equal(await baselineB(), untouchedB);
      await p.getByRole('button', { name: /Вернуть в библиотеку/ }).click();
      await removal
        .getByRole('button', { name: 'Убрать из библиотеки', exact: true })
        .waitFor();
      assert.equal(await baselineB(), untouchedB);
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      result.checks.push(
        `${theme}_${width}: UNREAD_CANCEL_CONFIRM_PUBLIC_VOTE_PRESERVED_TWO_USER_ISOLATION_REMOVE_REJECTED_COMMIT_ACK_LOST_READD=PASS`,
      );
    } finally {
      await c.close();
    }
  }
  const b = await context(1, 'paper', 390);
  try {
    const p = await b.newPage();
    await p.goto(origin + '/comics/' + prefix, { waitUntil: 'networkidle' });
    await p
      .locator('.wd08-row')
      .getByRole('button', { name: /Снять отметку:/ })
      .waitFor();
    await p.getByRole('tab', { name: 'Мой дневник', exact: true }).click();
    assert.equal(
      await p.locator('.journal-form textarea').inputValue(),
      'PRIVATE NOTE 1',
    );
    assert.equal(await baselineB(), untouchedB);
  } finally {
    await b.close();
  }
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.external, []);
  result.status = 'PASS';
  console.log(
    'RELEASE25_READER=PASS; TWO_USERS; NETWORK_FAILURES; NO_PROVIDER_HTTP',
  );
} catch (e) {
  result.status = 'BLOCKED';
  result.error = e.message;
  console.error('RELEASE25_FAILURE=' + e.message);
  throw e;
} finally {
  await browser.close();
  try {
    await q('DELETE FROM user_chapter_reads WHERE user_id=ANY($1::int[])', [
      users,
    ]);
    await q('DELETE FROM community_reviews WHERE user_id=ANY($1::int[])', [
      users,
    ]);
    await q('DELETE FROM comics WHERE id=$1', [book ?? 0]);
    await q('DELETE FROM users WHERE id=ANY($1::int[])', [users]);
  } finally {
    await pool.end();
    await writeFile(
      resolve(out, 'RESULTS.json'),
      JSON.stringify(result, null, 2) + '\n',
    );
  }
}
