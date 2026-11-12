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
const fixture = { adminId: null, readerId: null, categoryId: null, extraCategoryId: null, comicId: null };
let browser, adminPage, stage = 'setup';

// Screenshots are visual-only. All data is a synthetic disposable CI fixture.
async function adminPreview(filename) {
  if (process.env.ADMIN_CHAPTER_VISUAL_CAPTURE !== '1') return;
  await adminPage.screenshot({
    path: join(output, filename),
    fullPage: false,
    caret: 'initial',
    animations: 'disabled',
  });
}

// Top-layer dialogs must remain centered and completely usable on desktop and mobile.
async function assertCenteredChapterDialog(dialog, label, { longBatch = false } = {}) {
  const rect = await dialog.boundingBox();
  assert.ok(rect, `${label}: dialog is not visible`);
  const geometry = await adminPage.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(Math.abs(rect.x - (geometry.width - rect.width) / 2) <= 3,
    `${label}: dialog is not horizontally centered: ${JSON.stringify(rect)}`);
  assert.ok(rect.x >= -1 && rect.x + rect.width <= geometry.width + 1,
    `${label}: dialog exceeds the viewport horizontally`);
  assert.ok(rect.y >= -1 && rect.y + rect.height <= geometry.height + 1,
    `${label}: dialog exceeds the viewport vertically`);
  const scroller = dialog.locator('[data-chapter-dialog-scroll]');
  if (await scroller.count()) {
    const sizes = await scroller.evaluate(node => ({
      clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
      clientHeight: node.clientHeight, scrollHeight: node.scrollHeight,
    }));
    assert.ok(sizes.scrollWidth <= sizes.clientWidth + 2,
      `${label}: chapter form has horizontal overflow: ${JSON.stringify(sizes)}`);
    if (longBatch) assert.ok(sizes.scrollHeight > sizes.clientHeight + 100,
      `${label}: long batch should scroll inside dialog: ${JSON.stringify(sizes)}`);
    await scroller.evaluate(node => { node.scrollTop = node.scrollHeight; });
    const footer = await dialog.locator('[data-chapter-dialog-footer]').boundingBox();
    assert.ok(footer && footer.y >= rect.y - 1 && footer.y + footer.height <= geometry.height + 1,
      `${label}: actions must remain visible while chapters scroll`);
  }
}

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

  stage = 'UX05 admin navigation and category modal create/edit';
  assert.equal(await adminPage.locator('.admin-shell-nav').getByRole('link', { name: 'Главы', exact: true }).count(), 0,
    'the redundant chapters sidebar link must be absent');
  assert.equal(await adminPage.locator('.admin-shell-nav').getByRole('link', { name: 'Произведения' }).count(), 1);
  await adminPage.goto(`${origin}/admin/categories`, { waitUntil: 'load' });
  assert.equal(await adminPage.getByRole('heading', { name: 'Новая категория' }).count(), 0,
    'the obsolete inline creation form must be absent');
  const categoryTrigger = adminPage.getByRole('button', { name: 'Добавить категорию' });
  await categoryTrigger.click();
  let categoryDialog = adminPage.getByRole('dialog', { name: 'Добавить категорию' });
  await categoryDialog.waitFor({ state: 'visible' });
  await categoryDialog.getByLabel('Адрес категории (slug)').fill('temporary-unsaved');
  await categoryDialog.getByRole('button', { name: 'Отмена' }).click();
  await categoryDialog.waitFor({ state: 'hidden' });
  await categoryTrigger.click();
  categoryDialog = adminPage.getByRole('dialog', { name: 'Добавить категорию' });
  assert.equal(await categoryDialog.getByLabel('Адрес категории (slug)').inputValue(), '',
    'cancel must discard an unsaved category draft');
  const wizardCategorySlug = `ux05-${stamp}`;
  await categoryDialog.getByLabel('Адрес категории (slug)').fill(wizardCategorySlug);
  await categoryDialog.getByLabel('Название', { exact: true }).fill('UX05 категория');
  await categoryDialog.getByLabel('Описание').fill('Категория для проверки модального редактора');
  await adminPreview('10-ux05-category-create.png');
  await categoryDialog.getByRole('button', { name: 'Создать категорию' }).click();
  await categoryDialog.waitFor({ state: 'hidden' });
  const categoryRow = await eventually('SELECT id, name FROM categories WHERE slug = $1', [wizardCategorySlug],
    row => row?.name === 'UX05 категория', 'category wizard must create via API');
  fixture.extraCategoryId = categoryRow.id;
  const categoryItem = adminPage.locator(`[data-category-slug="${wizardCategorySlug}"]`);
  await categoryItem.waitFor({ state: 'visible' });
  await categoryItem.getByRole('button', { name: 'Изменить категорию' }).click();
  categoryDialog = adminPage.getByRole('dialog', { name: 'Изменить категорию' });
  await categoryDialog.waitFor({ state: 'visible' });
  assert.equal(await categoryDialog.getByLabel('Адрес категории (slug)').isEditable(), false,
    'existing category slug must remain immutable');
  await categoryDialog.getByLabel('Название', { exact: true }).fill('UX05 категория изменена');
  await adminPage.setViewportSize({ width: 320, height: 740 });
  const modalRect = await categoryDialog.boundingBox();
  assert.ok(modalRect && modalRect.x >= -1 && modalRect.x + modalRect.width <= 321,
    'category modal must fit a 320px viewport');
  await adminPreview('11-ux05-category-edit-mobile.png');
  await categoryDialog.getByRole('button', { name: 'Сохранить изменения' }).click();
  await categoryDialog.waitFor({ state: 'hidden' });
  await eventually('SELECT name FROM categories WHERE slug = $1', [wizardCategorySlug],
    row => row?.name === 'UX05 категория изменена', 'category wizard must update metadata');
  await adminPreview('12-ux05-category-list-mobile.png');
  await adminPage.setViewportSize({ width: 1440, height: 900 });
  await adminPage.goto(`${origin}/account`, { waitUntil: 'load' });
  assert.equal(await adminPage.getByRole('link', { name: /Панель управления/ }).count(), 1,
    'staff access to admin must remain available from Profile');
  await adminPage.goto(`${origin}/admin/comics`, { waitUntil: 'load' });
  await adminPage.getByRole('heading', { name: 'Управление комиксами' }).waitFor();
  console.log('ADMIN_CORE_UX05_CATEGORIES_AND_NAV=PASS');

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
  await editor.getByRole('button', { name: '+ Добавить главы', exact: true }).click();
  const chapterDialog = editor.getByRole('dialog', { name: 'Добавить главы' });
  await chapterDialog.getByLabel('Название главы').fill('Глава тестового выпуска');
  await chapterDialog.getByLabel('Ссылка на главу').fill('https://example.com/chapters/1');
  await chapterDialog.locator('details').first().locator('summary').click();
  await chapterDialog.getByLabel('Код главы').fill('1');
  await chapterDialog.getByRole('button', { name: '+ Ещё глава' }).click();
  await chapterDialog.getByLabel('Название главы').nth(1).fill('Вторая глава тестового выпуска');
  await chapterDialog.getByLabel('Ссылка на главу').nth(1).fill('https://example.com/chapters/2');
  await chapterDialog.locator('section').nth(1).locator('summary').click();
  await chapterDialog.getByLabel('Код главы').nth(1).fill('2');
  await chapterDialog.getByLabel('Статус добавляемых глав').selectOption('RELEASED');
  await assertCenteredChapterDialog(chapterDialog, 'desktop two chapters');
  await adminPreview('01-add-two-chapters.png');
  stage = 'mobile chapter batch dialog (two rows)';
  await adminPage.setViewportSize({ width: 360, height: 740 });
  await assertCenteredChapterDialog(chapterDialog, 'mobile two chapters');
  await adminPreview('06-mobile-two-chapters.png');
  await adminPage.setViewportSize({ width: 1440, height: 900 });
  await chapterDialog.getByRole('button', { name: 'Проверить главы' }).click();
  await chapterDialog.getByRole('button', { name: 'Сохранить 2 глав' }).click();
  await chapterDialog.waitFor({ state: 'hidden' });
  await eventually(
    `SELECT status, display_code AS code, title FROM chapters WHERE comic_id = $1 AND display_code = '1'`,
    [fixture.comicId], row => row?.status === 'RELEASED',
    'new released chapter did not persist',
  );
  const chapterRows = await pool.query(
    'SELECT display_code AS code, title, source_url AS url, sort_order AS position FROM chapters WHERE comic_id = $1 ORDER BY sort_order, id',
    [fixture.comicId],
  );
  assert.deepEqual(chapterRows.rows.map(row => row.code), ['1', '2'], 'batch chapters were not stored in the entered order');
  assert.equal(chapterRows.rows[1].url, 'https://example.com/chapters/2');
  console.log('ADMIN_CORE_CHAPTER_CREATE=PASS');

  stage = 'mobile long batch scroll (15 chapters, no save)';
  await editor.getByRole('button', { name: '+ Добавить главы', exact: true }).click();
  const longBatch = editor.getByRole('dialog', { name: 'Добавить главы' });
  for (let index = 1; index < 15; index++) {
    await longBatch.getByRole('button', { name: '+ Ещё глава' }).click();
  }
  await adminPage.setViewportSize({ width: 360, height: 740 });
  await assertCenteredChapterDialog(longBatch, 'mobile 15 chapter batch', { longBatch: true });
  await adminPreview('07-mobile-long-batch-360.png');
  await adminPage.setViewportSize({ width: 320, height: 640 });
  await assertCenteredChapterDialog(longBatch, 'small mobile 15 chapter batch', { longBatch: true });
  await adminPreview('08-mobile-long-batch-320.png');
  await longBatch.getByRole('button', { name: 'Отмена', exact: true }).click();
  await longBatch.waitFor({ state: 'hidden' });
  await adminPage.setViewportSize({ width: 1440, height: 900 });
  console.log('ADMIN_CORE_MOBILE_LONG_BATCH=PASS');

  stage = 'edit chapter in modal';
  await editor.getByRole('button', { name: 'Редактировать' }).first().click();
  const editDialog = editor.getByRole('dialog', { name: /Редактирование главы:/ });
  await editDialog.waitFor({ state: 'visible' });
  await assertCenteredChapterDialog(editDialog, 'desktop edit');
  await adminPreview('02-edit-prefilled-chapter.png');
  await adminPage.setViewportSize({ width: 360, height: 740 });
  await assertCenteredChapterDialog(editDialog, 'mobile edit');
  await adminPreview('09-mobile-edit.png');
  await adminPage.setViewportSize({ width: 1440, height: 900 });
  await editDialog.getByLabel('Название главы').fill('Глава исправлена через модальное окно');
  await editDialog.getByRole('button', { name: 'Сохранить главу' }).click();
  await editDialog.waitFor({ state: 'hidden' });
  await eventually(
    `SELECT title FROM chapters WHERE comic_id = $1 AND display_code = '1'`,
    [fixture.comicId], row => row?.title === 'Глава исправлена через модальное окно',
    'editing chapter from modal did not persist',
  );
  console.log('ADMIN_CORE_CHAPTER_EDIT_MODAL=PASS');
  stage = 'advanced atomic batch and chapter revision';
  const oldChapter = await pool.query(
    `SELECT id FROM chapters WHERE comic_id = $1 AND display_code = '1' AND status = 'RELEASED'`, [fixture.comicId],
  );
  const oldId = oldChapter.rows[0]?.id;
  assert.ok(oldId, 'original chapter must exist before replacement');
  await pool.query('INSERT INTO user_chapter_reads(user_id, chapter_id) VALUES ($1, $2)', [fixture.readerId, oldId]);
  await editor.getByRole('button', { name: '+ Добавить главы', exact: true }).click();
  const advanced = editor.getByRole('dialog', { name: 'Добавить главы' });
  assert.equal(await advanced.locator('section').count(), 1,
    'Cancel must discard all 15 unsaved rows before opening a fresh batch');
  assert.equal(await advanced.getByLabel('Статус добавляемых глав').inputValue(), 'SCHEDULED',
    'Cancel must restore the default chapter status');
  console.log('ADMIN_CORE_CHAPTER_CANCEL_RESETS_DRAFT=PASS');
  assert.equal(await editor.getByText('Расширенное создание: том, дата, точный порядок или новая редакция').count(), 0,
    'obsolete advanced inline editor must be absent from DOM');
  const first = advanced.locator('section').first();
  await first.locator('summary').click();
  await first.getByLabel('Новая редакция вместо существующей главы').selectOption(String(oldId));
  await first.getByLabel('Название главы').fill('Полностью обновлённая редакция');
  await first.getByRole('checkbox', { name: /Подтверждаю замену/ }).check();
  await advanced.getByRole('button', { name: '+ Ещё глава' }).click();
  const second = advanced.locator('section').nth(1);
  await second.getByLabel('Название главы').fill('Запланированная глава второго тома');
  await second.getByLabel('Ссылка на главу').fill('https://example.com/chapters/3');
  await second.locator('summary').click();
  await second.getByLabel('Код главы').fill('3');
  await second.getByLabel('Том (необязательно)').fill('2');
  assert.equal(await second.getByLabel('Расположение в томе').inputValue(), 'AUTO');
  assert.equal(await advanced.getByText('Точный порядок (необязательно)').count(), 0);
  await second.getByLabel('Точность ожидаемой даты').selectOption('MONTH');
  await second.getByLabel('Ожидаемый выход').fill('2027-04');
  await adminPreview('03-advanced-revision-and-volume.png');
  await advanced.getByRole('button', { name: 'Проверить главы' }).click();
  await advanced.getByRole('button', { name: 'Сохранить 2 глав' }).click();
  await advanced.waitFor({ state: 'hidden' });
  await eventually(
    'SELECT status FROM chapters WHERE id = $1', [oldId],
    row => row?.status === 'ARCHIVED', 'old version was not archived',
  );
  const revision = await pool.query(
    `SELECT id, status, supersedes_chapter_id AS old_id FROM chapters
     WHERE comic_id = $1 AND display_code = '1' AND id <> $2`, [fixture.comicId, oldId],
  );
  assert.equal(revision.rows.length, 1);
  assert.equal(revision.rows[0].status, 'RELEASED');
  assert.equal(revision.rows[0].old_id, oldId);
  const readHistory = await pool.query(
    'SELECT chapter_id FROM user_chapter_reads WHERE user_id = $1 AND chapter_id = $2', [fixture.readerId, oldId],
  );
  assert.equal(readHistory.rows.length, 1, 'old chapter reading history must remain attached to old ID');
  const future = await pool.query(
    `SELECT status, volume_number AS volume, sort_order AS position, expected_release AS expected
     FROM chapters WHERE comic_id = $1 AND display_code = '3'`, [fixture.comicId],
  );
  assert.equal(future.rows.length, 1);
  assert.deepEqual({ status: future.rows[0].status, volume: future.rows[0].volume,
    expected: future.rows[0].expected }, { status: 'SCHEDULED', volume: 2, expected: '2027-04' });
  assert.ok(Number.isInteger(future.rows[0].position) && future.rows[0].position > 0);
  console.log('ADMIN_CORE_ADVANCED_ATOMIC_BATCH_AND_REVISION=PASS');
  stage = 'relative chapter insertion in the same volume';
  await editor.getByRole('button', { name: '+ Добавить главы', exact: true }).click();
  const placed = editor.getByRole('dialog', { name: 'Добавить главы' });
  const placedRow = placed.locator('section').first();
  await placedRow.getByLabel('Название главы').fill('Глава перед запланированной');
  await placedRow.locator('summary').click();
  await placedRow.getByLabel('Код главы').fill('2.5');
  await placedRow.getByLabel('Том (необязательно)').fill('2');
  await placedRow.getByLabel('Расположение в томе').selectOption('BEFORE');
  const futureChapter = await pool.query('SELECT id FROM chapters WHERE comic_id = $1 AND display_code = $2', [fixture.comicId, '3']);
  const anchorChoice = placedRow.getByLabel('Соседняя глава в том же томе');
  await anchorChoice.locator(`option[value="${futureChapter.rows[0].id}"]`).waitFor({ state: 'attached', timeout: 30000 });
  await anchorChoice.selectOption(String(futureChapter.rows[0].id));
  await adminPreview('04-place-before-neighbor.png');
  await placed.getByRole('button', { name: 'Проверить главы' }).click();
  await placed.getByRole('button', { name: 'Сохранить главу' }).click();
  await placed.waitFor({ state: 'hidden' });
  const volumeTwo = await pool.query(`SELECT display_code AS code, sort_order AS position FROM chapters
    WHERE comic_id = $1 AND volume_number = 2 AND status <> 'ARCHIVED' ORDER BY sort_order, id`, [fixture.comicId]);
  assert.deepEqual(volumeTwo.rows.map(row => row.code), ['2.5', '3']);
  assert.ok(volumeTwo.rows[0].position < volumeTwo.rows[1].position);
  console.log('ADMIN_CORE_VOLUME_RELATIVE_PLACEMENT=PASS');
  await editor.locator('[data-chapter-group-heading="2"]').waitFor({ state: 'visible' });
  await editor.locator('[data-chapter-group-heading="none"]').waitFor({ state: 'visible' });
  await adminPreview('05-admin-chapter-list.png');
  console.log('ADMIN_CORE_VOLUME_GROUP_HEADERS=PASS');

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

  stage = 'UX05 mobile header search routes into filtered catalog';
  await guest.setViewportSize({ width: 360, height: 740 });
  await guest.goto(`${origin}/`, { waitUntil: 'load' });
  const headerSearchButton = guest.getByRole('button', { name: 'Поиск по каталогу' });
  await headerSearchButton.click();
  const headerSearchForm = guest.getByRole('search', { name: 'Поиск произведений' });
  await headerSearchForm.getByRole('searchbox', { name: 'Название произведения' }).fill(updatedTitle);
  const searchRect = await headerSearchForm.boundingBox();
  assert.ok(searchRect && searchRect.x >= -1 && searchRect.x + searchRect.width <= 361,
    'header search must fit mobile viewport');
  if (process.env.ADMIN_CHAPTER_VISUAL_CAPTURE === '1') await guest.screenshot({ path: join(output, '13-ux05-header-search-mobile.png'), animations: 'disabled' });
  await headerSearchForm.getByRole('searchbox', { name: 'Название произведения' }).press('Enter');
  await guest.waitForURL(url => url.pathname === '/' && url.searchParams.get('q') === updatedTitle);
  assert.equal(await guest.locator('.catalog-search-field input[name="q"]').inputValue(), updatedTitle,
    'catalog search must be populated from the header search');
  await guest.getByText(updatedTitle, { exact: true }).first().waitFor({ state: 'visible' });
  if (process.env.ADMIN_CHAPTER_VISUAL_CAPTURE === '1') await guest.screenshot({ path: join(output, '14-ux05-catalog-filtered.png'), animations: 'disabled' });
  console.log('ADMIN_CORE_UX05_HEADER_SEARCH=PASS');

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
    pass: true, stages: ['draft', 'cover', 'edit/reload', 'chapter', 'chapter edit', 'advanced atomic revision', 'publication', 'reader authorization'],
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
    // Reading marks are intentionally retained during revision; remove only this test reader's fixture marks before deleting the fixture comic.
    if (fixture.readerId) await pool.query('DELETE FROM user_chapter_reads WHERE user_id = $1', [fixture.readerId]);
    if (fixture.comicId) await pool.query('DELETE FROM comics WHERE id = $1', [fixture.comicId]);
    else await pool.query('DELETE FROM comics WHERE slug = $1', [stamp]);
    if (fixture.extraCategoryId) await pool.query('DELETE FROM categories WHERE id = $1', [fixture.extraCategoryId]);
    if (fixture.categoryId) await pool.query('DELETE FROM categories WHERE id = $1', [fixture.categoryId]);
    if (fixture.adminId || fixture.readerId) await pool.query('DELETE FROM users WHERE id = ANY($1::int[])',
      [[fixture.adminId, fixture.readerId].filter(Boolean)]);
  } catch (cleanupError) {
    console.error(`ADMIN_CORE_CLEANUP_FAILURE=${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
    process.exitCode = 1;
  }
  await pool.end();
}
