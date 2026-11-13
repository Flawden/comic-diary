// Isolated visual QA only. Never point this program at production or a shared database.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { checkMobileUxInteractions } from './mobile-ux-interactions.mjs';

const ORIGIN = 'http://127.0.0.1:3102';
const THEMES = ['paper', 'night', 'tea'];
const VIEWPORTS = [
  { id: 'mobile', width: 390, height: 844 },
  { id: 'tablet', width: 1024, height: 900 },
  { id: 'desktop', width: 1440, height: 900 },
];
const ROUTES = [
  { id: 'catalog', path: '/', selector: '.catalog-page', auth: true },
  { id: 'library', path: '/library', selector: '.fantasy-library', auth: true },
  { id: 'updates', path: '/updates', selector: '.fantasy-updates', auth: true },
  { id: 'account', path: '/account', selector: '.fantasy-account', auth: true },
  { id: 'work', path: null, selector: '.wd-work', auth: true },
  { id: 'login', path: '/login', selector: '.fantasy-auth-page', auth: false },
  { id: 'register', path: '/register', selector: '.fantasy-auth-page', auth: false },
];

// Explicit fail-closed boundary against accidentally using production credentials.
if (process.env.CI !== 'true' || process.env.VISUAL_QA_MODE !== 'isolated-ci') {
  throw new Error('Visual QA can run only in the isolated GitHub CI job');
}
const dbUrl = new URL(process.env.DATABASE_URL ?? '');
if (!['postgres:', 'postgresql:'].includes(dbUrl.protocol) ||
    dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '5432' ||
    dbUrl.pathname !== '/comic_diary_release' ||
    dbUrl.username !== 'comic_diary_ci') {
  throw new Error('REFUSED: DATABASE_URL is not the exact disposable CI database');
}
if (!process.env.WD_BROWSER_ROOT || !process.env.VISUAL_QA_DIR || !process.env.RUNNER_TEMP) {
  throw new Error('Visual QA needs the runner-only browser and artifacts directories');
}
const { chromium } = createRequire(join(process.env.WD_BROWSER_ROOT, 'package.json'))('playwright-core');
const OUTPUT = join(process.env.RUNNER_TEMP, 'comic-diary-visual-qa');
if (process.env.VISUAL_QA_DIR !== OUTPUT) {
  throw new Error('REFUSED: unexpected visual artifact destination');
}
mkdirSync(OUTPUT, { recursive: true });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const log = [];
const problems = [];
let browser;
let userId;
const comicIds = [];

function recordIssue(message) {
  problems.push(message);
  console.error(`VISUAL_QA_ISSUE: ${message}`);
}
function saveEvidence() {
  const manifest = {
    commit: process.env.GITHUB_SHA ?? null,
    environment: 'isolated disposable CI database; localhost-only web application',
    screenshotCount: log.filter(item => item.file).length,
    screenshots: log,
    issues: problems,
  };
  writeFileSync(join(OUTPUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const files = log.filter(item => item.file).map(item =>
    `<figure><a href="${item.file}"><img loading="lazy" src="${item.file}" alt="${item.theme} ${item.viewport} ${item.route}"></a><figcaption>${item.theme} · ${item.viewport} · ${item.route}</figcaption></figure>`);
  const markup = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comic Diary · Visual QA</title><style>body{margin:0;padding:24px;background:#15191a;color:#f7ebd6;font:16px system-ui}header{max-width:850px;margin:auto auto 26px}a{color:inherit}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}figure{margin:0;background:#262c2d;padding:10px;border-radius:12px}img{width:100%;height:auto;max-height:650px;object-fit:contain;object-position:top;display:block}figcaption{padding:10px 2px}</style><header><h1>Comic Diary · Visual QA</h1><p>${files.length} снимков: три темы, три размера экрана, изолированная тестовая база. Это свидетельства для ручного просмотра, а не гарантия визуального качества.</p><p>Подробности и ошибки — в <a href="manifest.json">manifest.json</a>.</p></header><main>${files.join('')}</main></html>`;
  writeFileSync(join(OUTPUT, 'index.html'), markup);
}

async function createFixture() {
  const prefix = `visual-${randomUUID()}`;
  userId = (await pool.query('INSERT INTO users(email, display_name) VALUES ($1,$2) RETURNING id', [`${prefix}@test.invalid`, 'Читатель QA'])).rows[0].id;
  const token = randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO sessions(user_id,token_hash,expires_at) VALUES ($1,$2,now()+interval \'1 hour\')', [userId, createHash('sha256').update(token).digest('hex')]);
  for (const [index, title] of ['Мезолит · QA', 'Короткая история · QA'].entries()) {
    const comicId = (await pool.query(
      'INSERT INTO comics(slug,title,source_url,description,publication_status,visibility) VALUES ($1,$2,$3,$4,\'PUBLISHED\',\'SHARED\') RETURNING id',
      [`${prefix}-${index}`, title, 'https://example.com/reading', index === 0 ? 'Тестовая история с более длинным описанием, чтобы увидеть выравнивание карточек.' : 'Короткое описание'],
    )).rows[0].id;
    comicIds.push(comicId);
    await pool.query('INSERT INTO user_comics(user_id,comic_id,status,personal_note) VALUES ($1,$2,$3,$4)', [userId, comicId, index === 0 ? 'READING' : 'WANT_TO_READ', index === 0 ? 'Заметка для проверки длинной карточки.' : null]);
    await pool.query('INSERT INTO chapters(comic_id,display_code,title,source_url,sort_order,status) VALUES ($1,$2,$3,$4,1,\'RELEASED\')', [comicId, '1', 'Охота на быка', 'https://example.com/one']);
    if (index === 0) {
      await pool.query('INSERT INTO chapters(comic_id,display_code,title,source_url,sort_order,status) VALUES ($1,$2,$3,$4,2,\'RELEASED\')', [comicId, '2', 'Вторая глава', 'https://example.com/two']);
    }
  }
  return { token, firstSlug: `${prefix}-0` };
}

async function makeContext(viewport, theme, token, authorized) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    locale: 'ru-RU',
  });
  await ctx.addCookies([
    { name: 'comic-diary-theme', value: theme, url: ORIGIN },
    ...(authorized ? [{ name: 'comic_diary_session', value: token, url: ORIGIN }] : []),
  ]);
  // The screenshot browser has no reason to contact external networks.
  await ctx.route('**/*', route => {
    const request = route.request();
    const requestUrl = request.url();
    if (!requestUrl.startsWith(`${ORIGIN}/`)) {
      return route.abort();
    }
    if (requestUrl.includes('/api/') && !['GET', 'HEAD'].includes(request.method())) {
      recordIssue(`Blocked unexpected API mutation on ${requestUrl.split('?')[0]}`);
      return route.abort();
    }
    return route.continue();
  });
  return ctx;
}

async function capture(viewport, theme, route, fixture) {
  const ctx = await makeContext(viewport, theme, fixture.token, route.auth);
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const path = route.id === 'work' ? `/comics/${fixture.firstSlug}` : route.path;
  const file = `${theme}-${viewport.id}-${route.id}.png`;
  const evidence = { theme, viewport: viewport.id, route: route.id, file: null };
  try {
    const response = await page.goto(`${ORIGIN}${path}`, { waitUntil: 'load', timeout: 35000 });
    assert.equal(response?.status(), 200, `${route.id}: HTTP status`);
    assert.equal(new URL(page.url()).pathname, path, `${route.id}: unexpected auth redirect`);
    await page.locator(route.selector).first().waitFor({ state: 'visible' });
    await page.locator('h1').first().waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      semanticBackground: getComputedStyle(document.documentElement).getPropertyValue('--cd-background').trim(),
      h1: document.querySelector('h1')?.textContent?.trim() ?? '',
    }));
    assert.equal(metrics.theme, theme, `${route.id}: theme is wrong`);
    assert.equal(await page.locator('nextjs-portal').count(), 0, `${route.id}: Next.js development overlay must not appear in release-mode screenshots`);
    assert.ok(metrics.semanticBackground, `${route.id}: semantic background token missing`);
    evidence.metrics = metrics;
    if (metrics.pageWidth > metrics.viewportWidth + 8) {
      recordIssue(`${file}: horizontal page overflow ${metrics.pageWidth - metrics.viewportWidth}px`);
    }
    if (route.id === 'catalog') {
      assert.equal(
        await page.locator('.catalog-related-links').count(),
        0,
        'Catalog must not render a duplicate cross-page navigation row',
      );

      const libraryCta = page.locator('.catalog-hero-library');
      assert.equal(await libraryCta.count(), 1, 'Catalog library CTA is missing');
      assert.equal(
        await libraryCta.getAttribute('href'),
        '/library',
        'Catalog library CTA destination changed',
      );
      const editorialRail = page.locator('.catalog-editorial-rail');
      assert.equal(await editorialRail.count(), 1, 'Catalog editorial rail markup is missing');
      const railVisible = await editorialRail.isVisible();
      if (viewport.id === 'desktop') {
        assert.equal(railVisible, true, 'Catalog editorial rail must be visible on desktop');
        assert.ok((await editorialRail.innerText()).trim().length > 0, 'Catalog editorial rail has no content');
      } else {
        assert.equal(railVisible, false, `Catalog editorial rail must be hidden on ${viewport.id}`);
      }
    }
    // The original artist WebP now decorates the catalog HERO, not a lower figure.
    // Decode it explicitly so test captures are meaningful on every viewport.
    if (route.id === 'catalog') {
      const hero = page.locator('.catalog-page .catalog-hero');
      assert.equal(await hero.count(), 1, 'Catalog hero missing');
      const dragon = await hero.evaluate(async (element) => {
        const background = getComputedStyle(element).backgroundImage;
        if (!background.includes('catalog-fireplace-dragon.webp')) {
          throw new Error('Original dragon is not the catalog hero background');
        }
        const img = new Image();
        img.src = '/images/fantasy-editorial/catalog/catalog-fireplace-dragon.webp';
        await img.decode();
        return { width: img.naturalWidth, height: img.naturalHeight };
      });
      assert.deepEqual(dragon, { width: 3000, height: 1200 }, 'Hero dragon failed to load at expected resolution');
      assert.equal(await page.locator('.catalog-fireplace').count(), 0, 'Old bottom dragon figure was not removed');
      console.log(`VISUAL_QA_DRAGON_HERO_LOADED: ${viewport.id} ${theme}`);
    }
    await page.screenshot({ path: join(OUTPUT, file), fullPage: true, animations: 'disabled' });
    evidence.file = file;
    console.log(`VISUAL_QA_CAPTURED: ${file}`);
    if (route.id === 'library') {
      const trigger = page.getByRole('button', { name: /Убрать «.*» из библиотеки/ }).first();
      await trigger.waitFor({ state: 'visible' });
      const iconSize = await trigger.locator('svg').evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
      assert.ok(iconSize.width <= 20 && iconSize.height <= 20, `QA-01 icon too large: ${JSON.stringify(iconSize)}`);
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Убрать с полки?' });
      await dialog.waitFor({ state: 'visible' });
      const modalFile = `${theme}-${viewport.id}-remove-confirmation.png`;
      await page.screenshot({ path: join(OUTPUT, modalFile), fullPage: true, animations: 'disabled' });
      log.push({ theme, viewport: viewport.id, route: 'remove-confirmation', file: modalFile });
      await dialog.getByRole('button', { name: 'Остаться' }).click();
      await dialog.waitFor({ state: 'hidden' });
      console.log(`VISUAL_QA_CAPTURED: ${modalFile} (cancelled without removal)`);
    }
  } catch (err) {
    const message = `${file}: ${err instanceof Error ? err.message : String(err)}`;
    recordIssue(message);
    // Even a failed route should leave an image of the actual failure state.
    try {
      const failed = `${theme}-${viewport.id}-${route.id}-FAILED.png`;
      await page.screenshot({ path: join(OUTPUT, failed), fullPage: true, timeout: 10000 });
      evidence.file = failed;
    } catch { /* preserve original failure */ }
  } finally {
    log.push(evidence);
    await ctx.close();
  }
}

async function checkThemeSelector(fixture) {
  const ctx = await makeContext(VIEWPORTS[0], 'paper', fixture.token, true);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => console.error(`VISUAL_QA_THEME_CLIENT_ERROR: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') console.error(`VISUAL_QA_THEME_CONSOLE_ERROR: ${message.text().slice(0, 500)}`);
  });
  try {
    const response = await page.goto(`${ORIGIN}/account`, { waitUntil: 'load', timeout: 35000 });
    assert.equal(response?.status(), 200, 'Theme selector: unexpected account response');
    await page.getByRole('heading', { name: 'Оформление' }).waitFor({ state: 'visible' });
    const labels = { night: 'Ночная', tea: 'Чайная', paper: 'Бумажная' };
    for (const theme of ['night', 'tea', 'paper']) {
      const radio = page.locator(`input[name="theme"][value="${theme}"]`);
      await radio.waitFor({ state: 'visible' });
      await radio.check();
      // A checked native radio alone doesn't prove that React handled the change.
      // Wait for the component's accessible status message before testing persistence.
      await page.getByRole('status').getByText(`Тема «${labels[theme]}» сохранена.`).waitFor({ state: 'visible', timeout: 10000 });
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme, `Live theme switch to ${theme} failed`);
      const cookies = await ctx.cookies(ORIGIN);
      assert.equal(cookies.find(cookie => cookie.name === 'comic-diary-theme')?.value, theme, `Theme cookie missing for ${theme}`);
      await page.reload({ waitUntil: 'load' });
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme, `Theme ${theme} did not survive reload`);
      assert.equal(await page.locator(`input[name="theme"][value="${theme}"]`).isChecked(), true, `Selected radio reset after ${theme} reload`);
      console.log(`VISUAL_QA_THEME_OK: ${theme}; react_message=ok; cookie=ok; reload=ok`);
    }
    console.log('VISUAL_QA_THEME_SWITCH=PASS; selected theme survives reload');
  } catch (err) {
    try {
      const diag = 'theme-selector-diagnostic.png';
      await page.screenshot({ path: join(OUTPUT, diag), fullPage: true, timeout: 10000 });
      console.error(`VISUAL_QA_THEME_DIAGNOSTIC: ${diag}`);
      console.error(`VISUAL_QA_THEME_STATE: ${JSON.stringify(await page.evaluate(() => ({
        theme: document.documentElement.getAttribute('data-theme'),
        checked: document.querySelector('input[name="theme"]:checked')?.getAttribute('value'),
        status: document.querySelector('[role="status"]')?.textContent?.trim() ?? '',
        cookie: document.cookie.split(';').map(x => x.trim()).find(x => x.startsWith('comic-diary-theme=')) ?? '',
      })))}`);
    } catch (diagError) {
      console.error(`VISUAL_QA_THEME_DIAGNOSTIC_ERROR: ${String(diagError)}`);
    }
    throw err;
  } finally {
    await ctx.close();
  }
}


// UX-07 final coverage: first visit without a cookie and the admin workspace.
// This code inherits the same strict disposable-CI guard and localhost-only browser boundary.
async function ux07CaptureAdmin(viewport, theme, fixture) {
  const ctx = await makeContext(viewport, theme, fixture.token, true);
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const file = `${theme}-${viewport.id}-admin-ux07.png`;
  const evidence = { theme, viewport: viewport.id, route: 'admin-ux07', file: null };
  try {
    const response = await page.goto(`${ORIGIN}/admin`, { waitUntil: 'load', timeout: 35000 });
    assert.equal(response?.status(), 200, 'Admin UX-07: expected 200');
    assert.equal(new URL(page.url()).pathname, '/admin', 'Admin UX-07: unexpected redirect');
    await page.locator('.admin-shell-sidebar').waitFor({ state: 'attached' });
    await page.locator('.admin-dashboard-hero h1').waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      sidebarBackground: getComputedStyle(document.querySelector('.admin-shell-sidebar')).backgroundColor,
      heroBackground: getComputedStyle(document.querySelector('.admin-dashboard-hero')).backgroundColor,
    }));
    assert.equal(metrics.theme, theme, `Admin UX-07: theme mismatch for ${file}`);
    assert.ok(metrics.sidebarBackground, `Admin UX-07: sidebar color unavailable for ${file}`);
    assert.ok(metrics.heroBackground, `Admin UX-07: hero color unavailable for ${file}`);
    if (metrics.pageWidth > metrics.viewportWidth + 8) {
      recordIssue(`Admin UX-07 ${file}: horizontal overflow ${metrics.pageWidth - metrics.viewportWidth}px`);
    }
    evidence.metrics = metrics;
    await page.screenshot({ path: join(OUTPUT, file), fullPage: true, animations: 'disabled' });
    evidence.file = file;
    console.log(`UX07_ADMIN_CAPTURED: ${file}`);
    if (viewport.id === 'mobile') {
      const toggle = page.locator('.admin-shell-mobile-toggle');
      await toggle.waitFor({ state: 'visible' });
      await toggle.click();
      await page.locator('.admin-shell-sidebar.is-open').waitFor({ state: 'visible' });
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'Admin UX-07: mobile menu failed to open');
      const menuFile = `${theme}-mobile-admin-open-menu-ux07.png`;
      await page.screenshot({ path: join(OUTPUT, menuFile), fullPage: true, animations: 'disabled' });
      log.push({ theme, viewport: 'mobile', route: 'admin-open-menu-ux07', file: menuFile });
      await page.keyboard.press('Escape');
      await page.locator('.admin-shell-sidebar.is-open').waitFor({ state: 'detached' });
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'Admin UX-07: Escape failed to close mobile menu');
      console.log(`UX07_ADMIN_MENU_CAPTURED: ${menuFile}`);
    } else {
      assert.equal(await page.locator('.admin-shell-sidebar').isVisible(), true,
        `Admin UX-07: sidebar must be visible on ${viewport.id}`);
    }
  } catch (err) {
    recordIssue(`Admin UX-07 ${file}: ${err instanceof Error ? err.message : String(err)}`);
    try {
      const failed = `${theme}-${viewport.id}-admin-ux07-FAILED.png`;
      await page.screenshot({ path: join(OUTPUT, failed), fullPage: true, timeout: 10000 });
      evidence.file = failed;
    } catch { /* preserve original failure */ }
  } finally {
    log.push(evidence);
    await ctx.close();
  }
}

async function ux07CheckFirstVisit(viewport) {
  // A fresh browser context, deliberately NO theme cookie and NO session.
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'ru-RU',
  });
  await ctx.route('**/*', route => {
    const request = route.request();
    if (!request.url().startsWith(`${ORIGIN}/`)) return route.abort();
    if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method())) {
      recordIssue('UX07_FIRST_VISIT: blocked unexpected API mutation');
      return route.abort();
    }
    return route.continue();
  });
  const file = `no-cookie-${viewport.id}-login-ux07.png`;
  const evidence = { theme: 'tea', viewport: viewport.id, route: 'no-cookie-first-visit-ux07', file: null };
  const page = await ctx.newPage();
  try {
    assert.equal((await ctx.cookies(ORIGIN)).length, 0, 'UX-07 first visit: browser context must be cookie-free');
    const response = await page.goto(`${ORIGIN}/login`, { waitUntil: 'load', timeout: 35000 });
    assert.equal(response?.status(), 200, 'UX-07 first visit: login failed');
    const html = await response.text();
    assert.match(html, /<html\b[^>]*\bdata-theme=["']tea["']/, 'UX-07 first visit: initial server HTML must be tea');
    await page.locator('.fantasy-auth-page').waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'tea', 'UX-07 first visit: hydrated theme must be tea');
    assert.equal((await ctx.cookies(ORIGIN)).some(cookie => cookie.name === 'comic-diary-theme'), false,
      'UX-07 first visit: should not need to write a theme cookie to get tea');
    evidence.metrics = { serverTheme: 'tea', clientTheme: 'tea', initialThemeCookie: 'absent' };
    await page.screenshot({ path: join(OUTPUT, file), fullPage: true, animations: 'disabled' });
    evidence.file = file;
    console.log(`UX07_FIRST_VISIT_OK: ${file}; server=tea; client=tea; no cookie`);
  } catch (err) {
    recordIssue(`UX-07 first visit ${file}: ${err instanceof Error ? err.message : String(err)}`);
    try {
      const failed = `no-cookie-${viewport.id}-login-ux07-FAILED.png`;
      await page.screenshot({ path: join(OUTPUT, failed), fullPage: true, timeout: 10000 });
      evidence.file = failed;
    } catch { /* preserve original failure */ }
  } finally {
    log.push(evidence);
    await ctx.close();
  }
}

async function ux07CheckAdminAndFirstVisit(fixture) {
  // Elevate ONLY the synthetic user of this run, in the disposable CI database.
  // Restore its role even if screenshots fail.
  const result = await pool.query('SELECT role FROM users WHERE id=$1', [userId]);
  assert.equal(result.rows.length, 1, 'UX-07 admin fixture: synthetic user not found');
  const previousRole = result.rows[0].role;
  await pool.query('UPDATE users SET role=$1 WHERE id=$2', ['ADMIN', userId]);
  try {
    for (const theme of THEMES) {
      for (const viewport of VIEWPORTS) {
        await ux07CaptureAdmin(viewport, theme, fixture);
      }
    }
  } finally {
    await pool.query('UPDATE users SET role=$1 WHERE id=$2', [previousRole, userId]);
  }
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
    await ux07CheckFirstVisit(viewport);
  }
}

try {
  const fixture = await createFixture();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const theme of THEMES) {
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        await capture(viewport, theme, route, fixture);
      }
    }
  }
  try {
    await checkMobileUxInteractions({ makeContext, viewport: VIEWPORTS.find(item => item.id === 'mobile'), origin: ORIGIN, fixture });
  } catch (err) {
    recordIssue(`Mobile UX interactions: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    await checkThemeSelector(fixture);
  } catch (err) {
    recordIssue(`Theme selector: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    await ux07CheckAdminAndFirstVisit(fixture);
  } catch (err) {
    recordIssue(`UX-07 admin/first visit: ${err instanceof Error ? err.message : String(err)}`);
  }
  for (const comicId of comicIds) {
    const rows = (await pool.query('SELECT in_library FROM user_comics WHERE user_id=$1 AND comic_id=$2', [userId, comicId])).rows;
    assert.equal(rows.length, 1, 'Unexpected removal of test title from library');
    assert.equal(rows[0].in_library, true, 'Confirmation screenshot caused a deletion');
  }
} catch (err) {
  recordIssue(`Harness failure: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
} finally {
  try { await browser?.close(); } catch (err) { recordIssue(`Browser cleanup: ${String(err)}`); }
  try {
    // Only synthetic rows in disposable DB; do not leave test records behind.
    if (userId) await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    for (const id of comicIds) await pool.query('DELETE FROM comics WHERE id=$1', [id]);
  } catch (err) { recordIssue(`Fixture cleanup: ${String(err)}`); }
  await pool.end();
  saveEvidence();
}

// Detect a basic theme-token regression as well as failed pages.
const catalogColors = THEMES.map(theme => log.find(item =>
  item.theme === theme && item.viewport === 'mobile' && item.route === 'catalog')?.metrics?.semanticBackground);
if (catalogColors.every(Boolean) && new Set(catalogColors).size !== THEMES.length) {
  recordIssue('Not all three themes have distinct --cd-background values');
}

const expected = THEMES.length * VIEWPORTS.length * (ROUTES.length + 1) +
  THEMES.length * VIEWPORTS.length + THEMES.length + 2;
// Existing 72 + nine admin pages + three opened mobile menus + two cookie-free first visits.
const captured = log.filter(item => item.file).length;
if (captured !== expected) recordIssue(`Expected ${expected} screenshots, captured ${captured}`);
if (problems.length) {
  console.error(`VISUAL_QA=FAIL; SCREENSHOTS=${captured}/${expected}; ISSUES=${problems.length}`);
  process.exitCode = 1;
} else {
  console.log(`VISUAL_QA=PASS; SCREENSHOTS=${captured}/${expected}; THEMES=paper,night,tea; VIEWPORTS=mobile,tablet,desktop`);
}
