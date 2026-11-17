// AUTH-01 D1: browser-visible QA on localhost / disposable GitHub CI only.
// No account fixture, password, token, mail transport, real provider, SQL writes or API POST.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const expectedDb = 'postgresql://comic_diary_ci:ci_ephemeral_password@127.0.0.1:5432/comic_diary_release';
const origin = 'http://127.0.0.1:3103';
const root = process.env.RUNNER_TEMP;
const output = process.env.D1_QA_OUTPUT;
if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REPOSITORY !== 'Flawden/comic-diary' ||
    process.env.DATABASE_URL !== expectedDb ||
    process.env.D1_QA_ORIGIN !== origin || !root ||
    output !== join(root, 'd1-auth-browser') ||
    !resolve(output).startsWith(resolve(root) + sep) ||
    process.env.REGISTRATION_ACTIVATION_REDEEM_ENABLED !== 'false' ||
    process.env.PASSWORD_RESET_REDEEM_ENABLED !== 'false' ||
    !process.env.WD_BROWSER_ROOT) {
  throw new Error('D1_BROWSER_QA_REFUSED: requires exact disposable CI, localhost and both redemption flags OFF');
}
const { chromium } = createRequire(join(process.env.WD_BROWSER_ROOT, 'package.json'))('playwright-core');
const themes = ['tea', 'paper', 'night'];
const views = [{ name: 'phone320', width: 320, height: 740 }, { name: 'desktop1440', width: 1440, height: 900 }];
const paths = [
  { href: '/login', heading: 'Вход' },
  { href: '/forgot-password', heading: 'Забыли пароль?' },
  { href: '/reset-password', heading: 'Новый пароль' },
  { href: '/activate', heading: 'Подтверждение почты' },
];
const manifest = { stage: 'AUTH-01 D1 browser QA', source: 'disposable localhost CI, flags OFF', pages: [], checks: [], screenshotCount: 0 };
const responseChecks = [];
let browser;
await mkdir(output, { recursive: true });
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const theme of themes) {
    for (const view of views) {
      const context = await browser.newContext({
        viewport: { width: view.width, height: view.height },
        reducedMotion: 'reduce', locale: 'ru-RU',
      });
      try {
        // No browser request may leave the isolated localhost fixture.
        await context.route('**/*', route => {
          const target = new URL(route.request().url());
          return target.origin === origin ? route.continue() : route.abort();
        });
        await context.addCookies([{ name: 'comic-diary-theme', value: theme, url: origin }]);
        const page = await context.newPage();
        page.setDefaultTimeout(25000);
        const errors = [];
        const posts = [];
        page.on('pageerror', error => errors.push(error.message.slice(0, 140)));
        page.on('request', request => { if (request.method() !== 'GET' && request.method() !== 'HEAD') posts.push(request.method()); });
        for (const entry of paths) {
          const result = await page.goto(origin + entry.href, { waitUntil: 'load' });
          assert.equal(result?.status(), 200, `${theme}/${view.name}${entry.href}: HTTP`);
          await page.getByRole('heading', { name: entry.heading, exact: true }).waitFor({ state: 'visible' });
          if (entry.href === '/forgot-password') {
            assert.equal(await page.locator('input[name="email"]').count(), 0, 'No misleading email request form');
            await page.getByText('Отправка кодов сброса пароля пока не подключена.', { exact: false }).waitFor();
            await page.getByRole('link', { name: 'У меня уже есть код' }).waitFor();
          }
          if (entry.href === '/reset-password' || entry.href === '/activate') {
            const form = page.locator('form');
            assert.equal(await form.count(), 1, 'One redemption form');
            assert.equal(await form.locator('fieldset').isDisabled(), true, 'OFF fieldset must be disabled');
            assert.equal(await form.locator('button[type="submit"]').isDisabled(), true, 'OFF submit must be disabled');
            assert.equal(await form.locator('input[name="token"]').isDisabled(), true, 'OFF token must be disabled');
            assert.equal(await form.locator('input[name="newPassword"]').isDisabled(), true, 'OFF password must be disabled');
            assert.equal(await form.locator('input[name="newPasswordConfirm"]').isDisabled(), true, 'OFF confirmation must be disabled');
            assert.equal(new URL(page.url()).search, '', 'Token must not appear in URL');
            if (entry.href === '/activate') {
              await page.getByText('Подтверждение пока недоступно:', { exact: false }).waitFor();
            } else {
              await page.getByText('Приём кодов восстановления сейчас отключён', { exact: false }).waitFor();
            }
          }
          await page.evaluate(() => document.fonts.ready);
          const renderedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
          assert.equal(renderedTheme, theme, `${view.name}${entry.href}: theme cookie not applied`);
          const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
          assert.ok(width.scroll <= width.client + 3, `${theme}/${view.name}${entry.href}: horizontal overflow ${JSON.stringify(width)}`);
          const name = `d1-${theme}-${view.name}-${entry.href.slice(1)}.png`;
          await page.screenshot({ path: join(output, name), fullPage: true, animations: 'disabled', caret: 'hide' });
          manifest.pages.push({ theme, viewport: view.name, route: entry.href, screenshot: name, horizontalOverflow: false, http: 200 });
          assert.equal(posts.length, 0, `${theme}/${view.name}: unexpected non-GET request`);
          assert.deepEqual(errors, [], `${theme}/${view.name}: runtime browser page errors`);
        }
        // An actual in-browser navigation confirms the linked flow, not just the text.
        await page.goto(origin + '/login', { waitUntil: 'load' });
        await page.getByRole('link', { name: 'Забыли пароль?' }).click();
        await page.waitForURL(origin + '/forgot-password');
        await page.getByRole('link', { name: 'У меня уже есть код' }).click();
        await page.waitForURL(origin + '/reset-password');
        await page.getByRole('link', { name: 'Вернуться ко входу' }).click();
        await page.waitForURL(origin + '/login');
        manifest.checks.push({ theme, viewport: view.name, navigation: 'login-forgot-reset-login', postRequests: 0 });
        assert.equal(posts.length, 0, 'No authentication POST is permitted during QA');
        assert.deepEqual(errors, [], 'No browser pageerrors after navigation');
        responseChecks.push(`${theme}/${view.name}`);
        await page.close();
      } finally {
        await context.close();
      }
    }
  }
  manifest.screenshotCount = manifest.pages.length;
  assert.equal(manifest.screenshotCount, 24);
  assert.equal(responseChecks.length, 6);
  console.log('D1_BROWSER_QA=24_24_PAGES_PASS; THEMES=3; VIEWPORTS=2; NAVIGATION=6_6; POST_REQUESTS=0');
} finally {
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (browser) await browser.close();
}
