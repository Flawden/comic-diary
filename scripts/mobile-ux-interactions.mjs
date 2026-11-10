// CI-only interactive checks of mobile UX. Called by the existing Visual QA harness.
// Uses its isolated fixture, localhost browser and fail-closed network guard.
// Never submits data-changing requests or navigates to production.
import assert from 'node:assert/strict';

export async function checkMobileUxInteractions({ makeContext, viewport, origin, fixture }) {
  assert.ok(viewport?.id === 'mobile', 'Mobile viewport missing from Visual QA harness');

  async function withPage(path, run) {
    const context = await makeContext(viewport, 'tea', fixture.token, true);
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const response = await page.goto(`${origin}${path}`, { waitUntil: 'load', timeout: 35000 });
      assert.equal(response?.status(), 200, `Mobile UX ${path}: HTTP status`);
      await run(page);
    } finally {
      await context.close();
    }
  }

  async function checkCollapsibleFilter(page, rootSelector, label) {
    const root = page.locator(rootSelector);
    const toggle = root.getByRole('button', { name: label, exact: true });
    const content = root.locator('.responsive-filter-content');
    await toggle.waitFor({ state: 'visible' });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false', `${label} should start collapsed on mobile`);
    assert.equal(await content.isVisible(), false, `${label} unexpectedly visible before opening`);
    await toggle.click();
    await content.waitFor({ state: 'visible' });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true', `${label} did not expand`);
    await toggle.click();
    await content.waitFor({ state: 'hidden' });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false', `${label} did not collapse`);
  }

  await withPage('/', async page => {
    await page.locator('.catalog-page').waitFor({ state: 'visible' });
    await checkCollapsibleFilter(page, '.catalog-mobile-filter-panel', 'Поиск и фильтры');
    console.log('VISUAL_QA_MOBILE_CATALOG_FILTER=PASS');
  });

  await withPage('/library', async page => {
    await page.locator('.fantasy-library').waitFor({ state: 'visible' });
    await checkCollapsibleFilter(page, '.library-mobile-filter-panel', 'Поиск и сортировка');
    const readingTab = page.locator('.library-tabs a').filter({ hasText: 'Читаю' }).first();
    await readingTab.waitFor({ state: 'visible' });
    await readingTab.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, Math.min(320, Math.max(0, document.documentElement.scrollHeight - window.innerHeight))));
    await page.evaluate(() => { window.__comicDiaryQaNavMarker = 'kept-in-browser'; });
    const beforeScroll = await page.evaluate(() => window.scrollY);
    await readingTab.click();
    await page.waitForURL(url => url.pathname === '/library' && url.searchParams.get('status') === 'READING');
    await page.locator('.library-tabs a[aria-current="page"]').filter({ hasText: 'Читаю' }).waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => window.__comicDiaryQaNavMarker), 'kept-in-browser', 'Library tab caused a full document reload');
    const after = await page.evaluate(() => ({ y: window.scrollY, maxY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight) }));
    if (beforeScroll > 130 && after.maxY > 130) {
      assert.ok(after.y > 40, `Library tab unexpectedly reset scroll to top (${beforeScroll} -> ${after.y})`);
    }
    console.log(`VISUAL_QA_MOBILE_LIBRARY_TABS=PASS; scroll=${beforeScroll}->${after.y}`);
  });

  await withPage('/updates', async page => {
    await page.locator('.fantasy-updates').waitFor({ state: 'visible' });
    await checkCollapsibleFilter(page, '.updates-mobile-filter-panel', 'Поиск и фильтры');
    const reveal = page.locator('.updates-reveal').first();
    await reveal.waitFor({ state: 'visible' });
    assert.equal(await reveal.getAttribute('aria-expanded'), 'false', 'Unread chapters should start collapsed');
    await reveal.click();
    await page.locator('.updates-panel').first().waitFor({ state: 'visible' });
    assert.equal(await reveal.getAttribute('aria-expanded'), 'true', 'Unread chapters did not expand');
    await page.locator('.updates-panel-heading').getByText(/^Показано \d+ из \d+$/).first().waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await page.locator('.updates-panel [role="alert"]').count(), 0, 'Unread chapters API returned an error');
    await reveal.click();
    await page.locator('.updates-panel').first().waitFor({ state: 'hidden' });
    console.log('VISUAL_QA_MOBILE_UPDATES=PASS; panel=toggle; chapters=loaded');
  });
  console.log('VISUAL_QA_MOBILE_INTERACTIONS=PASS');
}
