// ADMIN-CORE-01: release-gate browser test against GitHub Actions' disposable DB.
// Never run against a real user database or a public server.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (process.env.CI !== 'true' || !databaseUrl ||
    new URL(databaseUrl).pathname !== '/comic_diary_release' ||
    new URL(databaseUrl).hostname !== '127.0.0.1') {
  throw new Error('ADMIN-CORE-01 may run only in CI with local disposable comic_diary_release PostgreSQL');
}
if (!process.env.WD_BROWSER_ROOT) throw new Error('WD_BROWSER_ROOT is required');
const { chromium } = createRequire(join(process.env.WD_BROWSER_ROOT, 'package.json'))('playwright-core');
const origin = 'http://127.0.0.1:3102';
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const stamp = `admin-core-${randomUUID().slice(0, 12)}`;
const title = `ADMIN CORE fixture ${stamp}`;
const updatedTitle = `ADMIN CORE updated ${stamp}`;
const categorySlug = `category-${stamp}`;
const output = process.env.ADMIN_CORE_OUTPUT ?? '/tmp/admin-core-01';
const fixture = { adminId: null, readerId: null, categoryId: null, comicId: null };
let browser, adminPage, stage = 'setup';

async function eventually(query, params, check, message, ms = 20000) {
  const until = Date.now() + ms;
  let observed;
  do {
    const result = await pool.query(query, params);
    observed = result.rows[0] ?? null;
    if (check(observed)) return observed;
    await new Promise(resolve => setTimeout(resolve, 250));
  } while (Date.now() < until);
  throw new Error(`${message}; observed ${JSON.stringify(observed)}`);
}

async function addSession(userId) {
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO sessions(user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + interval '1 hour')`,
    [userId, createHash('sha256').update(token).digest('hex')],
  );
  return token;
}

// Small valid PNG with a real IHDR/IDAT/IEND. No external image or network.
function coverPng() {
  const width = 400, height = 600;
  const pixels = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3;
      pixels[i] = 66; pixels[i + 1] = 52; pixels[i + 2] = 133;
    }
  }
  const crc32 = bytes => {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const typeBytes = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
    return Buffer.concat([length, typeBytes, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2; // truecolor RGB8
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function main() {
  stage = 'fixture';
  await mkdir(output, { recursive: true });
  const admin = await pool.query('INSERT INTO users(email, role) VALUES ($1, $2) RETURNING id', [`${stamp}-admin@test.invalid`, 'ADMIN']);
  fixture.adminId = admin.rows[0].id;
  const reader = await pool.query('INSERT INTO users(email, role) VALUES ($1, $2) RETURNING id', [`${stamp}-reader@test.invalid`, 'USER']);
  fixture.readerId = reader.rows[0].id;
  const category = await pool.query('INSERT INTO categories(slug, name) VALUES ($1, $2) RETURNING id', [categorySlug, 'ADMIN CORE testing']);
  fixture.categoryId = category.rows[0].id;
  const adminToken = await addSession(fixture.adminId);
  const readerToken = await addSession(fixture.readerId);

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'comic_diary_session', value: adminToken, url: origin }]);
  adminPage = await context.newPage();
  adminPage.setDefaultTimeout(25000);

  stage = 'admin page authorization';
  await adminPage.goto(`${origin}/admin/comics`, { waitUntil: 'load' });
  assert.equal(new URL(adminPage.url()).pathname, '/admin/comics', 'admin unexpectedly redirected');
  await adminPage.getByRole('heading', { name: 'Управление комиксами' }).waitFor();

  stage = 'create wizard opens';
  await adminPage.locator('.admin-studio-add-button').click();
  const wizard = adminPage.locator('dialog.admin-studio-create-dialog');
  await wizard.waitFor({ state: 'visible' });
  await wizard.locator('input[name="title"]').fill(title);
  await wizard.locator('input[name="slug"]').fill(stamp);
  await wizard.locator('select[name="categorySlug"]').selectOption(categorySlug);
  await wizard.locator('textarea[name="description"]').fill('Проверка полного цикла создания, правки и публикации.');
  assert.equal(await wizard.locator('input[name="sourceUrl"]').inputValue(), '', 'source URL must be optional');

  stage = 'wizard artwork step and real cover upload';
  await wizard.getByRole('button', { name: /Далее/ }).click();
  await wizard.locator('[data-create-step="artwork"]').waitFor({ state: 'visible' });
  await wizard.getByRole('button', { name: /Выбрать обложку/ }).click();
  const coverDialog = adminPage.locator('dialog.admin-studio-background-dialog[open]');
  await coverDialog.waitFor({ state: 'visible' });
  await coverDialog.locator('input[type="file"]').first().setInputFiles({
    name: 'admin-core-cover.png', mimeType: 'image/png', buffer: coverPng(),
  });
  await eventually(
    `SELECT count(*)::int AS count FROM administrative_audit_events WHERE actor_user_id = $1 AND action = 'COMIC_CREATE'`,
    [fixture.adminId], row => row?.count === 0,
    'initial cover upload must not create a comic', 5000,
  );
  await coverDialog.locator('input[name="coverUrl"]').waitFor({ state: 'attached' });
  await adminPage.waitForFunction(() => {
    const dialog = document.querySelector('dialog.admin-studio-background-dialog[open]');
    const field = dialog?.querySelector('input[name="coverUrl"]');
    return field instanceof HTMLInputElement && field.value.trim().length > 0;
  }, null, { timeout: 30000 });
  await coverDialog.getByRole('button', { name: 'Готово' }).click();
  await coverDialog.waitFor({ state: 'hidden' });
  await wizard.getByRole('button', { name: /Далее/ }).click();
  await wizard.getByRole('heading', { name: 'Всё готово?' }).waitFor();

  stage = 'draft creation through UI';
  await wizard.getByRole('button', { name: 'Сохранить черновик' }).click();
  const draft = await eventually(
    `SELECT id, title, description, source_url AS "sourceUrl", cover_url AS "coverUrl",
            publication_status AS status FROM comics WHERE slug = $1`,
    [stamp], row => row?.status === 'HIDDEN' && row.sourceUrl === null && !!row.coverUrl,
    'draft was not persisted with nullable source and uploaded cover',
  );
  fixture.comicId = draft.id;
  assert.equal(draft.title, title);
  await wizard.waitFor({ state: 'hidden' });
  console.log('ADMIN_CORE_DRAFT_CREATE=PASS');

  stage = 'metadata edit and reload';
  await adminPage.locator('.admin-studio-filters input[type="search"]').fill(stamp);
  const item = adminPage.locator('.admin-studio-item').filter({ hasText: stamp });
  await item.waitFor();
  await item.click();
  let editor = adminPage.locator('article.admin-studio-comic-panel:not([hidden])');
  await editor.locator('input[name="title"]').fill(updatedTitle);
  await editor.locator('textarea[name="description"]').fill('Изменено редактором в браузерном тесте.');
  await editor.getByRole('button', { name: 'Сохранить изменения' }).click();
  await eventually(
    'SELECT title, description FROM comics WHERE id = $1', [fixture.comicId],
    row => row?.title === updatedTitle && row.description === 'Изменено редактором в браузерном тесте.',
    'editing metadata did not persist',
  );
  await adminPage.reload({ waitUntil: 'load' });
  await adminPage.locator('.admin-studio-filters input[type="search"]').fill(stamp);
  await adminPage.locator('.admin-studio-item').filter({ hasText: stamp }).click();
  editor = adminPage.locator('article.admin-studio-comic-panel:not([hidden])');
  assert.equal(await editor.locator('input[name="title"]').inputValue(), updatedTitle);
  console.log('ADMIN_CORE_EDIT_RELOAD=PASS');

  stage = 'chapter creation through UI';
  await editor.locator('.admin-studio-tabs').getByRole('button', { name: 'Главы' }).click();
  await editor.locator('input[name="chapterDisplayCode"]').fill('1');
  await editor.locator('input[name="chapterTitle"]').fill('Глава тестового выпуска');
  await editor.locator('select[name="chapterStatus"]').selectOption('RELEASED');
  await editor.getByRole('button', { name: /Создать главу/ }).click();
  await eventually(
    `SELECT status, display_code AS code, title FROM chapters WHERE comic_id = $1 AND display_code = '1'`,
    [fixture.comicId], row => row?.status === 'RELEASED',
    'new released chapter did not persist',
  );
  console.log('ADMIN_CORE_CHAPTER_CREATE=PASS');

  stage = 'publish from admin UI';
  await editor.locator('.admin-studio-tabs').getByRole('button', { name: 'Публикация' }).click();
  await editor.locator('select[name="publicationStatus"]').selectOption('PUBLISHED');
  await editor.getByRole('button', { name: 'Сохранить изменения' }).click();
  await eventually('SELECT publication_status AS status FROM comics WHERE id = $1', [fixture.comicId],
    row => row?.status === 'PUBLISHED', 'publishing through the UI did not persist');

  stage = 'public reader view';
  const guestContext = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const guest = await guestContext.newPage();
  const published = await guest.goto(`${origin}/comics/${stamp}`, { waitUntil: 'load' });
  assert.equal(published?.status(), 200, 'published work must be accessible to guests');
  await guest.getByText(updatedTitle, { exact: true }).first().waitFor();
  console.log('ADMIN_CORE_PUBLISH_PUBLIC=PASS');

  stage = 'reader forbidden from admin UI/API';
  const readerContext = await browser.newContext();
  await readerContext.addCookies([{ name: 'comic_diary_session', value: readerToken, url: origin }]);
  const readerPage = await readerContext.newPage();
  await readerPage.goto(`${origin}/admin/comics`, { waitUntil: 'load' });
  await readerPage.getByText('Доступ запрещён').waitFor();
  const denied = await readerContext.request.post(`${origin}/api/admin/catalog/comics`, {
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    data: { slug: `${stamp}-forbidden` },
  });
  assert.equal(denied.status(), 403, 'USER must not have shared catalog write permission');
  console.log('ADMIN_CORE_READER_FORBIDDEN=PASS');

  stage = 'complete';
  await writeFile(join(output, 'admin-core-result.json'), JSON.stringify({
    pass: true, stages: ['draft', 'cover', 'edit/reload', 'chapter', 'publication', 'reader authorization'],
  }, null, 2));
  console.log('ADMIN_CORE_01=PASS');
}

try {
  await main();
} catch (error) {
  console.error(`ADMIN_CORE_01=FAIL stage=${stage}: ${error instanceof Error ? error.message : String(error)}`);
  await mkdir(output, { recursive: true }).catch(() => {});
  await writeFile(join(output, 'admin-core-result.json'), JSON.stringify({
    pass: false, stage, error: error instanceof Error ? error.message : String(error),
  }, null, 2)).catch(() => {});
  if (adminPage) await adminPage.screenshot({ path: join(output, 'admin-core-failure.png'), fullPage: true, caret: 'initial' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  // Fixture cleanup is defensive. This also runs on failed assertions.
  try {
    if (fixture.adminId || fixture.readerId) {
      await pool.query('DELETE FROM administrative_audit_events WHERE actor_user_id = ANY($1::int[])',
        [[fixture.adminId, fixture.readerId].filter(Boolean)]);
    }
    if (fixture.comicId) await pool.query('DELETE FROM comics WHERE id = $1', [fixture.comicId]);
    else await pool.query('DELETE FROM comics WHERE slug = $1', [stamp]);
    if (fixture.categoryId) await pool.query('DELETE FROM categories WHERE id = $1', [fixture.categoryId]);
    if (fixture.adminId || fixture.readerId) await pool.query('DELETE FROM users WHERE id = ANY($1::int[])',
      [[fixture.adminId, fixture.readerId].filter(Boolean)]);
  } catch (cleanupError) {
    console.error(`ADMIN_CORE_CLEANUP_FAILURE=${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
    process.exitCode = 1;
  }
  await pool.end();
}
