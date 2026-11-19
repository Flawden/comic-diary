/** Localhost-only UI acceptance. Every auth POST is fulfilled by Playwright. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Pool } from 'pg';

const origin = process.env.AUTH01_BROWSER_ORIGIN;
const enabled = process.env.AUTH01_BROWSER_MODE === 'enabled';
if (!['http://127.0.0.1:3108', 'http://127.0.0.1:3109'].includes(origin)) throw Error('REFUSED: localhost UI target required');
const database = new URL(process.env.DATABASE_URL ?? '');
if (database.hostname !== '127.0.0.1' || !['/auth01_nightshift', '/comic_diary_release'].includes(database.pathname)) throw Error('REFUSED: disposable DB required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  assert.equal((await pool.query('SELECT enabled FROM password_reset_mail_dispatch_control WHERE id=1')).rows[0].enabled, false);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM password_reset_mail_outbox WHERE state='ready'")).rows[0].n, 0);
} finally { await pool.end(); }
const { chromium } = createRequire(resolve(process.env.WD_BROWSER_ROOT ?? '.qa/browser', 'package.json'))('playwright-core');
const browser = await chromium.launch({ ...(process.env.AUTH01_BROWSER_EXECUTABLE ? { executablePath: process.env.AUTH01_BROWSER_EXECUTABLE } : { channel: 'chrome' }), headless: true });
const output = resolve('.qa/recovery-browser', enabled ? 'enabled' : 'disabled');
await mkdir(output, { recursive: true });
const checks = [];
try {
  for (const theme of ['tea', 'paper', 'night']) for (const width of [320, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU', reducedMotion: 'reduce' });
    let requestPosts = 0, redeemPosts = 0;
    let scenario = 'accepted';
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (request.method() === 'POST') {
        if (url.pathname === '/api/auth/password-reset/request') {
          requestPosts++;
          assert.deepEqual(Object.keys(request.postDataJSON()), ['email']);
          if (scenario === 'offline') return route.abort();
          const status = scenario === 'accepted' ? 202 : Number(scenario);
          return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 202 ? { ok: true } : { error: 'unavailable' }) });
        }
        if (url.pathname === '/api/auth/password-reset/redeem') {
          redeemPosts++;
          assert.deepEqual(Object.keys(request.postDataJSON()).sort(), ['newPassword', 'newPasswordConfirm', 'token']);
          return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
        }
        throw Error('Unexpected POST');
      }
      return route.continue();
    });
    await context.addCookies([{ name: 'comic-diary-theme', value: theme, url: origin }]);
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(origin + '/login');
      await page.getByRole('link', { name: 'Забыли пароль?' }).click();
      await page.waitForURL(origin + '/forgot-password');
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 3));
      if (!enabled) {
        assert.equal(await page.locator('input[name="email"]').count(), 0);
        await page.getByText('Отправка кодов сброса пароля пока не подключена.', { exact: false }).waitFor();
        await page.getByRole('link', { name: 'У меня уже есть код' }).click();
        assert.equal(await page.locator('input[name="token"]').isDisabled(), true);
      } else {
        await page.locator('input[name="email"]').waitFor();
        await page.screenshot({ path: join(output, `${theme}-${width}-request.png`), fullPage: true });
        await page.locator('input[name="email"]').fill('synthetic@example.invalid');
        await page.getByRole('button', { name: 'Получить код восстановления' }).click();
        await page.getByRole('status').getByText('Если для этого адреса доступно восстановление', { exact: false }).waitFor();
        assert.equal(requestPosts, 1);
        await page.getByRole('link', { name: 'Ввести код и новый пароль' }).click();
        await page.waitForURL(origin + '/reset-password');
        assert.equal(new URL(page.url()).search, '');
        await page.locator('input[name="token"]').fill(Buffer.alloc(32, 17).toString('base64url'));
        await page.locator('input[name="newPassword"]').fill('Synthetic-Password-123!');
        await page.locator('input[name="newPasswordConfirm"]').fill('Synthetic-Password-123!');
        await page.getByRole('button', { name: 'Установить новый пароль' }).click();
        await page.getByRole('status').getByText('Пароль изменён.', { exact: false }).waitFor();
        assert.equal(redeemPosts, 1);
        await page.screenshot({ path: join(output, `${theme}-${width}-complete.png`), fullPage: true });
        for (const [value, message] of [['429', 'Слишком много запросов'], ['503', 'Восстановление сейчас недоступно'], ['offline', 'Нет соединения с сервером']]) {
          scenario = value;
          await page.goto(origin + '/forgot-password');
          await page.locator('input[name="email"]').fill('synthetic@example.invalid');
          await page.getByRole('button', { name: 'Получить код восстановления' }).click();
          await page.getByRole('alert').getByText(message, { exact: false }).waitFor();
        }
      }
      assert.deepEqual(errors, []);
      checks.push({ theme, width, enabled, requestPosts, redeemPosts, pageErrors: 0 });
    } finally { await context.close(); }
  }
  await writeFile(join(output, 'manifest.json'), JSON.stringify({ checks, providerNetwork: false, authPostsMocked: true }, null, 2));
  console.log(`AUTH01_BROWSER=${enabled ? 'ENABLED_MOCK' : 'OFF'}; CASES=${checks.length}; PASS`);
} finally { await browser.close(); }
