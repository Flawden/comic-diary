/*
 * UX-06: ephemeral, synthetic-browser QA. Run only in isolated GitHub Actions.
 * No production data, DB calls or credentials. Screenshots in artifacts/.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = 'http://127.0.0.1:43861/ux06-qa';
const themes = ['tea', 'paper', 'night'];
const mobileSizes = [{ width: 320, height: 720 }, { width: 390, height: 844 }];
const outputs = path.resolve('artifacts/ux06-mobile');
fs.mkdirSync(outputs, { recursive: true });

const results = [];
let browser;
function screenshotPath(theme, mode, width) {
  return path.join(outputs, `ux06-${theme}-${mode}-${width}.png`);
}

async function record(page, theme, mode, width, height) {
  const info = await page.evaluate(({ mode }) => {
    const target = mode === 'search' ? document.querySelector('form[role="search"]') : document.querySelector('dialog[open]');
    const b = target && target.getBoundingClientRect();
    return {
      viewport: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      found: Boolean(target),
      rect: b && { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height },
      background: target && getComputedStyle(target).backgroundColor,
      rootTheme: document.documentElement.getAttribute('data-theme'),
    };
  }, { mode });
  const result = { theme, mode, width, height, ...info };
  results.push(result);
  assert.equal(result.viewport, width, 'real viewport width differs from requested width');
  assert.equal(result.found, true, `${theme}/${mode}: target is not present`);
  assert.equal(result.rootTheme, theme, 'active theme mismatch');
  assert.ok(result.rect.width >= 100, 'target unexpectedly narrow');
  assert.ok(result.rect.left >= -2 && result.rect.right <= width + 2, `${theme}/${mode}/${width}: horizontal clipping: ${JSON.stringify(result.rect)}`);
  assert.ok(result.rect.top >= -2 && result.rect.bottom <= height + 2, `${theme}/${mode}/${width}: vertical clipping: ${JSON.stringify(result.rect)}`);
  await page.screenshot({ path: screenshotPath(theme, mode, width), animations: 'disabled' });
  console.log(`PASS ${theme}/${mode}/${width}: ${JSON.stringify(result.rect)} panel=${result.background}`);
  return result;
}

async function runCase(theme, mode, size) {
  const context = await browser.newContext({
    viewport: size, deviceScaleFactor: 1, isMobile: size.width <= 390,
    hasTouch: size.width <= 390,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  try {
    const response = await page.goto(`${base}?theme=${theme}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.equal(response?.status(), 200, `synthetic route not ready: ${response?.status()}`);
    await page.waitForFunction(t => document.documentElement.getAttribute('data-theme') === t, theme);
    if (mode === 'search') {
      const trigger = page.getByRole('button', { name: 'Поиск по каталогу' });
      await trigger.click();
      const form = page.locator('form[role="search"]');
      await form.waitFor({ state: 'visible' });
      const metrics = await record(page, theme, mode, size.width, size.height);
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
      await page.keyboard.press('Escape');
      await form.waitFor({ state: 'detached' });
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
      if (size.width > 767) {
        const labelHidden = await page.locator('button[aria-label="Поиск по каталогу"] span').evaluate(el => getComputedStyle(el).display === 'none');
        assert.equal(labelHidden, true, 'desktop should display icon without search label');
      }
      return metrics;
    }

    const trigger = page.getByRole('button', { name: 'Читать полное описание произведения' });
    await trigger.click();
    const dialog = page.locator('dialog[open]');
    await dialog.waitFor({ state: 'visible' });
    assert.ok((await dialog.innerText()).length > 1000, 'full description is unexpectedly short');
    const metrics = await record(page, theme, mode, size.width, size.height);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    const restoredFocus = await trigger.evaluate(el => el === document.activeElement);
    assert.equal(restoredFocus, true, 'keyboard focus did not return to the original button');
    return metrics;
  } finally {
    await context.close();
  }
}

(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const size of [...mobileSizes, { width: 1366, height: 900 }]) {
    for (const theme of themes) {
      for (const mode of ['search', 'modal']) {
        await runCase(theme, mode, size);
      }
    }
  }
  const differentSearchColors = new Set(results.filter(r => r.mode === 'search' && r.width === 390).map(r => r.background));
  assert.equal(differentSearchColors.size, 3, 'search panel is not styled differently in all three themes');
  console.log('UX06_MOBILE_QA=PASS');
})().catch(error => {
  console.error('UX06_MOBILE_QA=FAIL', error.stack || String(error));
  process.exitCode = 1;
}).finally(async () => {
  fs.writeFileSync(path.join(outputs, 'geometry.json'), JSON.stringify(results, null, 2));
  if (browser) await browser.close();
});
