// End-to-end check against the disposable CI database and the real Next app.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
if (process.env.CI !== "true" || new URL(process.env.DATABASE_URL).pathname !== "/comic_diary_release")
  throw new Error("This probe requires the disposable CI database");
const { chromium } = createRequire(process.env.WD_BROWSER_ROOT+"/package.json")("playwright-core");
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL});
const prefix="reader-"+randomUUID(), origin="http://127.0.0.1:3102";
let user,comic,browser;
try {
  user=(await pool.query("INSERT INTO users(email) VALUES ($1) RETURNING id",[prefix+"@test.invalid"])).rows[0].id;
  const token=randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES ($1,$2,now()+interval '1 hour')",[user,createHash("sha256").update(token).digest("hex")]);
  comic=(await pool.query("INSERT INTO comics(slug,title,source_url,description) VALUES ($1,'Мезолит',$2,'Описание истории') RETURNING id",[prefix,"https://example.com/book"])).rows[0].id;
  await pool.query("INSERT INTO user_comics(user_id,comic_id) VALUES ($1,$2)",[user,comic]);
  await pool.query("INSERT INTO chapters(comic_id,display_code,title,source_url,sort_order,status,expected_release) VALUES ($1,'1','Охота на быка','https://example.com/one',1,'RELEASED',NULL),($1,'','УРГА','https://example.com/two',2,'RELEASED',NULL),($1,'3','Просыпание','https://example.com/unreleased-secret',3,'SCHEDULED','2026-11')",[comic]);
  browser=await chromium.launch({channel:"chrome",headless:true});
  const ctx=await browser.newContext({viewport:{width:360,height:800}});
  await ctx.addCookies([{name:"comic_diary_session",value:token,url:origin}]);
  const page=await ctx.newPage();
  page.setDefaultTimeout(25000);
  const url=origin+"/comics/"+prefix;
  // BR02/3J: treat "visible button" and "hydrated, functioning button" as
  // different states.  CI occasionally clicks /updates before React attaches
  // the event handler.  Verify the UI transition and the lazy chapter request.
  async function expandUnreadChapters(card, step) {
    const reveal = card.getByRole("button", { name: /Показать непрочитанные главы/ });
    await reveal.waitFor({ state: "visible" });
    assert.equal(await reveal.getAttribute("aria-expanded"), "false", `${step}: unread panel was already open`);
    const panelId = await reveal.getAttribute("aria-controls");
    assert.ok(panelId && /^updates-[0-9]+$/.test(panelId), `${step}: unexpected panel id`);
    const responses = [];
    const requestFailures = [];
    const onResponse = response => {
      if (response.url().startsWith(origin + "/api/library/updates?")) responses.push(response.status());
    };
    const onFailed = request => {
      if (request.url().startsWith(origin + "/api/library/updates?")) {
        requestFailures.push(request.failure()?.errorText || "request failed");
      }
    };
    page.on("response", onResponse);
    page.on("requestfailed", onFailed);
    try {
      await reveal.click();
      // A panel is mounted only after the React onClick has run. This is not
      // merely a visibility check on the initial server-rendered button.
      try {
        await page.waitForFunction(id => !!document.getElementById(id), panelId, { timeout: 3500 });
      } catch (firstAttemptError) {
        const expanded = await reveal.getAttribute("aria-expanded");
        // Retry once only if there was NO state transition and NO API traffic.
        // Never double-toggle a panel that already opened or is loading.
        if (expanded !== "false" || responses.length || requestFailures.length) throw firstAttemptError;
        console.warn(`BR02_UPDATES_HYDRATION_RETRY step=${step}`);
        await reveal.click();
        await page.waitForFunction(id => !!document.getElementById(id), panelId, { timeout: 12000 });
      }
      const panel = page.locator(`[id="${panelId}"]`);
      await panel.waitFor({ state: "visible" });
      await panel.locator(".updates-panel-heading").getByText(/^Показано \d+ из \d+$/).waitFor({ state: "visible", timeout: 20000 });
      assert.equal(await panel.locator('[role="alert"]').count(), 0, `${step}: chapter loading returned a UI error`);
      assert.ok(responses.some(status => status >= 200 && status < 300), `${step}: no successful /api/library/updates response`);
      console.log(`BR02_UPDATES_LOADED step=${step}; responses=${responses.join(",")}`);
    } catch (error) {
      // Log non-sensitive diagnostics only: never session cookies, tokens, or
      // the full response payload from the disposable test account.
      const panel = page.locator(`[id="${panelId}"]`);
      const diagnostic = {
        step,
        expanded: await reveal.getAttribute("aria-expanded").catch(() => "detached"),
        panelCount: await panel.count().catch(() => -1),
        heading: (await panel.locator(".updates-panel-heading").allTextContents().catch(() => [])).map(x => x.slice(0, 100)),
        error: (await panel.locator('[role="alert"]').allTextContents().catch(() => [])).map(x => x.slice(0, 150)),
        volumes: (await panel.locator(".updates-volume summary").allTextContents().catch(() => [])).map(x => x.slice(0, 100)),
        apiStatuses: responses,
        requestFailures,
      };
      console.error("BR02_UPDATES_DIAGNOSTICS=" + JSON.stringify(diagnostic));
      throw error;
    } finally {
      page.off("response", onResponse);
      page.off("requestfailed", onFailed);
    }
  }
  // WD18: the updates feed expands unread chapters in place, grouped by volume.
  // A scheduled chapter must not appear in the feed or be marked as read there.
  await pool.query("UPDATE chapters SET volume_number=1 WHERE comic_id=$1 AND status='RELEASED'",[comic]);
  await page.goto(origin+"/updates");
  const updateCard=page.locator(".updates-item").filter({hasText:"Мезолит"});
  await expandUnreadChapters(updateCard, "WD18 first open");
  const firstVolume=updateCard.locator(".updates-volume").first();
  const volumeSummaries=await updateCard.locator(".updates-volume summary").allTextContents();
  assert.ok(volumeSummaries.some(text => text.includes("Том 1")),
    `WD18: expected Том 1 after chapter loading; observed: ${JSON.stringify(volumeSummaries)}`);
  await firstVolume.locator("summary").getByText("Том 1").waitFor();
  await firstVolume.locator("ul > li").first().getByText("1 — Охота на быка").waitFor();
  // It opens by default, and native toggle actions remain interactive afterwards.
  await firstVolume.locator("summary").click();
  assert.equal(await firstVolume.evaluate(node=>node.open),false);
  assert.equal(await firstVolume.locator("ul > li").first().getByText("1 — Охота на быка").isVisible(),false);
  await firstVolume.locator("summary").click();
  await firstVolume.locator("ul > li").first().getByText("1 — Охота на быка").waitFor();
  assert.equal(await updateCard.getByText("Просыпание").count(),0);
  await updateCard.getByRole("button",{name:"Отметить 1 — Охота на быка прочитанной"}).click();
  // WD18.3: reading from Updates offers the existing optional rating sheet.
  const updateRating=page.getByRole("dialog",{name:"Охота на быка"});
  await updateRating.waitFor();
  assert.equal(await updateRating.getByRole("group",{name:"Оценка от 1 до 5"}).locator("button").count(),5);
  await updateRating.getByText("Оценивать необязательно").waitFor();
  await updateRating.getByRole("button",{name:"Закрыть окно оценки главы"}).click();
  await page.getByRole("button",{name:"Снять последнюю отметку"}).click();
  await page.getByText("Отметка снята.").waitFor();
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM user_chapter_reads WHERE user_id=$1",[user])).rows[0].count,0);
  // Rate a read chapter while remaining on the Updates page, then change the rating.
  await expandUnreadChapters(updateCard, "WD18 reopen");
  await updateCard.getByRole("button",{name:"Отметить 1 — Охота на быка прочитанной"}).click();
  await updateRating.waitFor();
  await updateRating.getByRole("button",{name:"4 из 5"}).click();
  await updateRating.getByText("Оценка сохранена").waitFor();
  assert.equal((await pool.query("SELECT rating FROM user_chapter_reads WHERE user_id=$1 AND chapter_id=(SELECT id FROM chapters WHERE comic_id=$2 AND display_code='1')",[user,comic])).rows[0].rating,4);
  await updateRating.getByRole("button",{name:"Закрыть окно оценки главы"}).click();
  assert.equal(await page.getByRole("button",{name:"Снять последнюю отметку"}).count(),0);
  await page.getByRole("button",{name:"Изменить оценку"}).click();
  await updateRating.getByRole("button",{name:"5 из 5"}).click();
  await updateRating.getByText("Оценка сохранена").waitFor();
  assert.equal((await pool.query("SELECT rating FROM user_chapter_reads WHERE user_id=$1 AND chapter_id=(SELECT id FROM chapters WHERE comic_id=$2 AND display_code='1')",[user,comic])).rows[0].rating,5);
  await updateRating.getByRole("button",{name:"Закрыть окно оценки главы"}).click();
  // Preference disabled on the work page must also suppress automatic prompts
  // in Updates. Manual rating is still available from the latest-mark banner.
  await pool.query("UPDATE user_comics SET prompt_chapter_rating=false WHERE user_id=$1 AND comic_id=$2",[user,comic]);
  await page.goto(origin+"/updates");
  await expandUnreadChapters(updateCard, "WD18 reopen");
  await updateCard.getByRole("button",{name:"Отметить УРГА прочитанной"}).click();
  assert.equal(await page.getByRole("dialog").count(),0);
  await page.getByRole("button",{name:"Оценить главу"}).click();
  const manualRating=page.getByRole("dialog",{name:"УРГА"});
  await manualRating.waitFor();
  await manualRating.getByRole("button",{name:"3 из 5"}).click();
  await manualRating.getByText("Оценка сохранена").waitFor();
  assert.equal((await pool.query("SELECT rating FROM user_chapter_reads WHERE user_id=$1 AND chapter_id=(SELECT id FROM chapters WHERE comic_id=$2 AND title='УРГА')",[user,comic])).rows[0].rating,3);
  await manualRating.getByRole("button",{name:"Закрыть окно оценки главы"}).click();
  await pool.query("UPDATE user_comics SET prompt_chapter_rating=true WHERE user_id=$1 AND comic_id=$2",[user,comic]);
  // Isolate all later work-page scenarios from this Updates-only fixture.
  await pool.query("DELETE FROM user_chapter_reads WHERE user_id=$1 AND chapter_id IN (SELECT id FROM chapters WHERE comic_id=$2)",[user,comic]);
  console.log("PASS: WD18.3 optional Updates rating, skip, undo, persistence and editing");
  // WD18.4: the feed is unread-only and paginated. Its previous-chapter
  // suggestion must use the full registry, preserve read marks, and skip
  // scheduled chapters even when their sort order precedes the target.
  await pool.query("INSERT INTO chapters(comic_id,display_code,title,source_url,sort_order,status,volume_number) VALUES ($1,'4','Долина','https://example.com/four',4,'RELEASED',2),($1,'5','Река','https://example.com/five',5,'RELEASED',2),($1,'6','Лес','https://example.com/six',6,'RELEASED',2)",[comic]);
  await pool.query("INSERT INTO user_chapter_reads(user_id,chapter_id) SELECT $1,id FROM chapters WHERE comic_id=$2 AND status='RELEASED' AND sort_order IN (1,2)",[user,comic]);
  await page.goto(origin+"/updates");
  const bulkUpdateCard=page.locator(".updates-item").filter({hasText:"Мезолит"});
  await expandUnreadChapters(bulkUpdateCard, "WD18.4 bulk open");
  await bulkUpdateCard.getByRole("button",{name:"Отметить 6 — Лес прочитанной"}).click();
  const updateBulk=page.locator("dialog.wd-bulk-sheet[open]");
  await updateBulk.getByRole("heading",{name:"Отметить предыдущие главы?"}).waitFor();
  await updateBulk.getByText("4 · Долина").waitFor();
  await updateBulk.getByText("5 · Река").waitFor();
  assert.equal(await updateBulk.getByText("3 · Просыпание").count(),0);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM user_chapter_reads WHERE user_id=$1 AND chapter_id IN (SELECT id FROM chapters WHERE comic_id=$2)",[user,comic])).rows[0].count,3);
  await updateBulk.getByRole("button",{name:"Отметить предыдущие (2)"}).click();
  await updateBulk.getByRole("heading",{name:"Готово! Хотите оценить?"}).waitFor();
  await updateBulk.getByRole("button",{name:"4 · Долина: 4 из 5"}).click();
  await updateBulk.getByRole("button",{name:"6 · Лес: 3 из 5"}).click();
  await updateBulk.getByRole("button",{name:"Сохранить выбранные оценки (2)"}).click();
  await updateBulk.getByRole("heading",{name:"Оценки сохранены"}).waitFor();
  const bulkRows=(await pool.query("SELECT c.display_code, r.rating FROM user_chapter_reads r JOIN chapters c ON c.id=r.chapter_id WHERE r.user_id=$1 AND c.comic_id=$2 ORDER BY c.sort_order",[user,comic])).rows;
  assert.deepEqual(bulkRows.map(r=>[r.display_code,r.rating]),[["1",null],["",null],["4",4],["5",null],["6",3]]);
  await updateBulk.getByRole("button",{name:"Готово"}).click();
  await pool.query("DELETE FROM user_chapter_reads WHERE user_id=$1 AND chapter_id IN (SELECT id FROM chapters WHERE comic_id=$2)",[user,comic]);
  await pool.query("DELETE FROM chapters WHERE comic_id=$1 AND sort_order IN (4,5,6)",[comic]);
  console.log("PASS: WD18.4 Updates prior gaps across volumes, scheduled exclusion, single batch and optional ratings");
  // Restore the original flat-list fixture for the WD12–WD16 reader scenarios.
  await pool.query("UPDATE chapters SET volume_number=NULL WHERE comic_id=$1",[comic]);
  await page.goto(url+"#my-reading");
  const diary=page.getByRole("tabpanel",{name:"Мой дневник"});
  await diary.waitFor();
  await diary.locator("textarea").fill("Моя заметка");
  await page.getByRole("tab",{name:"Об истории"}).click();
  await page.locator(".wd-hero-summary").getByText("Описание истории",{exact:true}).waitFor();
  assert.equal(await page.getByRole("tabpanel",{name:"Об истории"}).getByText("Описание истории",{exact:true}).count(),0);
  await page.getByRole("tab",{name:/Главы/}).click();
  const chapters=page.getByRole("tabpanel",{name:/Главы/});
  const planned=chapters.locator(".wd-row--scheduled");
  await planned.getByText("Просыпание", { exact: true }).waitFor();
  await planned.getByText("Выход: ноябрь 2026 г.").waitFor();
  assert.equal(await planned.locator("a, button").count(), 0);
  const heroProgress=page.locator(".wd-hero-progress");
  await heroProgress.getByText("Прочитано: 0 из 2").waitFor();
  assert.equal(await chapters.locator(".wd-progress").count(),0, "WD-HERO-01: no duplicate overall progress in chapters");
  assert.equal(await page.getByRole("tabpanel",{name:"Мой дневник"}).locator(".wd-progress").count(),0, "WD-HERO-01: registered chapters have only hero progress");
  // WD-HERO-02B: real-browser diagnostics and difficult reader states.
  // All fixtures live in comic_diary_release and are removed/restored below.
  // Capture only bounded, sanitized diagnostics; never cookies or session tokens.
  if (process.env.WD_VISUAL_OUTPUT) {
    const screenshots = process.env.WD_VISUAL_OUTPUT;
    await mkdir(screenshots, {recursive:true});
    const stripSecrets = value => String(value ?? "")
      .replaceAll(token, "[session-redacted]")
      .replaceAll(prefix, "[fixture-redacted]")
      .replace(/postgres(?:ql)?:\/\/\S+/gi, "[database-url-redacted]")
      .slice(0, 1400);
    const redactObject = object => JSON.parse(JSON.stringify(object, (_key,value) =>
      typeof value === "string" ? stripSecrets(value) : value));
    const diagnostics = {stage:"WD-HERO-02D",viewportChecks:{},browserEvents:{},devOverlay:{},violations:[]};
    // Keep screenshot mutations and warnings correlated with their exact capture.
    const screenshotPhase = new WeakMap();
    const setPhase = (testPage, phase) => screenshotPhase.set(testPage, phase);
    const capture = async (testPage, filename, options={}) => {
      setPhase(testPage, `capture ${filename}`);
      await testPage.screenshot({path:join(screenshots,filename),animations:"disabled",caret:"initial",...options});
      // Give asynchronously emitted console warnings a chance to be attributed
      // to the capture, rather than a later navigation.
      await testPage.waitForTimeout(150);
      setPhase(testPage, `after ${filename}`);
    };
    const recordEvents = (testPage, label) => {
      const events={pageErrors:[],consoleErrors:[],hydrationPhases:[],failedRequests:[],httpErrors:[]};
      const push=(list, item)=>{if(list.length<15) list.push(stripSecrets(item));};
      setPhase(testPage,"navigation / before first capture");
      testPage.on("pageerror", error => push(events.pageErrors,error?.message));
      testPage.on("console", msg=>{
        if(msg.type()!=="error") return;
        const message=msg.text();
        push(events.consoleErrors,message);
        if(/a tree hydrated but some attributes|hydration failed|text content does not match server-rendered html/i.test(message))
          push(events.hydrationPhases,screenshotPhase.get(testPage)||"unknown");
      });
      testPage.on("requestfailed", req => {
        if(req.url().startsWith(origin))push(events.failedRequests,`${new URL(req.url()).pathname}: ${req.failure()?.errorText}`);
      });
      testPage.on("response", response => {
        if(response.status()>=400 && response.url().startsWith(origin))
          push(events.httpErrors,`${response.status()} ${new URL(response.url()).pathname}`);
      });
      diagnostics.browserEvents[label]=events;
    };
    const inspectOverlay = async testPage => testPage.evaluate(() => {
      const host=document.querySelector("nextjs-portal");
      const root=host?.shadowRoot;
      if(!host) return {present:false};
      if(!root) return {present:true,shadowAccessible:false};
      const nodes=Array.from(root.querySelectorAll('[role="dialog"], [data-nextjs-dialog], [aria-live], button'));
      return {present:true,shadowAccessible:true,
        visibleNodes:nodes.filter(el=>el.getBoundingClientRect().width>0)
          .slice(0,16).map(el=>({role:el.getAttribute('role'),label:el.getAttribute('aria-label'),
            text:(el.innerText||el.textContent||'').trim().slice(0,600)}))};
    });
    const layout = async testPage => testPage.evaluate(() => ({
      width:window.innerWidth,
      scrollWidth:document.documentElement.scrollWidth,
      viewportHeight:window.innerHeight,
      heroHeight:Math.round(document.querySelector('.wd-hero')?.getBoundingClientRect().height||0),
    }));
    let desktopContext, mobileContext, controlContext;
    try {
      // Control: navigate without taking any screenshots. If React still warns
      // about hydration here, the issue is independent of screenshot capture.
      controlContext=await browser.newContext({viewport:{width:1440,height:900}});
      await controlContext.addCookies([{name:"comic_diary_session",value:token,url:origin}]);
      const controlPage=await controlContext.newPage();
      recordEvents(controlPage,"no-screenshot-control");
      await controlPage.goto(url+"#chapters");
      await controlPage.locator(".wd-hero-progress").getByText("Прочитано: 0 из 2").waitFor();
      await controlPage.waitForLoadState("load");
      await controlPage.waitForTimeout(700);
      await controlContext.close();
      controlContext=null;
      // First reproduce the original 0/2 case with event listeners attached
      // BEFORE navigation, so hydration warnings/errors are not missed.
      recordEvents(page,"original-mobile");
      await page.evaluate(() => document.fonts.ready);
      await capture(page,"01-mobile-360.png",{fullPage:true});
      desktopContext=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
      await desktopContext.addCookies([{name:"comic_diary_session",value:token,url:origin}]);
      const desktopPage=await desktopContext.newPage();
      recordEvents(desktopPage,"desktop-1440");
      await desktopPage.goto(url+"#chapters");
      await desktopPage.locator(".wd-hero-progress").getByText("Прочитано: 0 из 2").waitFor();
      await desktopPage.evaluate(() => document.fonts.ready);
      await capture(desktopPage,"02-desktop-1440.png",{fullPage:true});
      diagnostics.devOverlay.beforeClick=redactObject(await inspectOverlay(desktopPage));
      const issueTrigger=desktopPage.locator("nextjs-portal").getByText(/\b\d+ Issues?\b/i).first();
      if (await issueTrigger.count()) {
        try {
          await issueTrigger.click({timeout:2500});
          diagnostics.devOverlay.clickedIssue=true;
          diagnostics.devOverlay.afterClick=redactObject(await inspectOverlay(desktopPage));
          await capture(desktopPage,"04-next-dev-issue.png");
        } catch (error) {
          diagnostics.devOverlay.clickError=stripSecrets(error.message);
        }
      }
      setPhase(desktopPage,"tablet viewport / reload");
      await desktopPage.setViewportSize({width:768,height:900});
      // The Next.js issue overlay may have opened. Close it by navigating to
      // the same isolated test page rather than hiding or muting its indicator.
      await desktopPage.reload();
      await desktopPage.locator(".wd-hero-progress").getByText("Прочитано: 0 из 2").waitFor();
      await desktopPage.evaluate(() => document.fonts.ready);
      await capture(desktopPage,"03-tablet-768.png",{fullPage:true});
      diagnostics.viewportChecks.tablet=await layout(desktopPage);
      if(diagnostics.viewportChecks.tablet.scrollWidth > 769)
        diagnostics.violations.push("tablet horizontal overflow");

      mobileContext=await browser.newContext({viewport:{width:360,height:800},deviceScaleFactor:1});
      await mobileContext.addCookies([{name:"comic_diary_session",value:token,url:origin}]);
      const mobilePage=await mobileContext.newPage();
      recordEvents(mobilePage,"mobile-fresh");
      await mobilePage.goto(url+"#chapters");
      await mobilePage.locator(".wd-hero-progress").getByText("Прочитано: 0 из 2").waitFor();
      // Fixed navigation must not occlude the bottom chapter after a genuine
      // scroll inside a 360x800 viewport (fullPage screenshots cannot prove it).
      await mobilePage.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
      await mobilePage.waitForTimeout(100);
      diagnostics.viewportChecks.mobileBottom=await mobilePage.evaluate(() => {
        const nav=document.querySelector('.tea-navigation');
        const row=Array.from(document.querySelectorAll('.wd-chapter-content .wd-row')).at(-1);
        const nr=nav?.getBoundingClientRect(), rr=row?.getBoundingClientRect();
        return {navFound:!!nr,lastRowFound:!!rr,
          navTop:nr?Math.round(nr.top):null,lastRowBottom:rr?Math.round(rr.bottom):null,
          scrollY:Math.round(window.scrollY),scrollWidth:document.documentElement.scrollWidth,
          viewport:window.innerWidth};
      });
      const mb=diagnostics.viewportChecks.mobileBottom;
      if(!mb.navFound || !mb.lastRowFound || mb.lastRowBottom>mb.navTop-4 || mb.scrollWidth>mb.viewport+1)
        diagnostics.violations.push("mobile bottom navigation overlaps final chapter or horizontal overflow");

      // Isolated SQL fixture: long multi-paragraph description, genuine image
      // element with a local synthetic SVG cover, not an external URL.
      const longDescription=[
        "Туман поднимался над долиной. Герои искали тропу через густой лес, и каждый новый поворот раскрывал ещё одну часть древней истории. За старым мостом их ждало забытое поселение, о котором не говорили даже самые старые книги.",
        "Второй абзац описывает путешествие гораздо подробнее. Важны отношения персонажей, маленькие решения и последствия каждого шага. Это проверка переносов строк, размера карточки и поведения длинного текста рядом с обложкой.",
        "Третий абзац остаётся доступным после раскрытия. Проверяем длинное_слово_без_пробелов_для_безопасного_переноса_строк_в_узком_интерфейсе_комикса_и_проверки_переполнения.",
      ].join("\n\n");
      await pool.query("UPDATE comics SET description=$1,cover_url=$2 WHERE id=$3",
        [longDescription,"/art/wd-hero-ci-cover.svg",comic]);
      try {
        await mobilePage.reload();
        await mobilePage.locator('.wd-hero-summary button[aria-haspopup="dialog"]').waitFor();
        await mobilePage.locator('.wd-cover img').waitFor();
        await mobilePage.waitForFunction(() => {
          const img=document.querySelector('.wd-cover img');
          return !!img && img.complete && img.naturalWidth>0;
        },null,{timeout:12000});
        await capture(mobilePage,"05-mobile-long-cover.png",{fullPage:true});
        const descriptionTrigger=mobilePage.locator('.wd-hero-summary button[aria-haspopup="dialog"]');
        await descriptionTrigger.focus();
        await mobilePage.keyboard.press('Enter');
        const descriptionDialog=mobilePage.locator('.wd-hero-summary dialog');
        await descriptionDialog.waitFor({state:'visible'});
        assert.equal(await descriptionDialog.evaluate(el=>el.open),true,
          "full description dialog must open from keyboard");
        assert.equal((await descriptionDialog.innerText()).includes('Третий абзац'),true,
          "full description dialog must contain the complete description");
        await capture(mobilePage,"06-mobile-expanded.png",{fullPage:true});
        diagnostics.viewportChecks.mobileExpanded=await layout(mobilePage);
        if(diagnostics.viewportChecks.mobileExpanded.scrollWidth>361)
          diagnostics.violations.push('expanded long description causes mobile horizontal overflow');
        await mobilePage.setViewportSize({width:320,height:740});
        await capture(mobilePage,"09-mobile-expanded-320.png",{fullPage:true});
        diagnostics.viewportChecks.mobile320=await layout(mobilePage);
        if(diagnostics.viewportChecks.mobile320.scrollWidth>321)
          diagnostics.violations.push('320px long description causes horizontal overflow');
        await mobilePage.keyboard.press('Escape');
        await descriptionDialog.waitFor({state:'hidden'});
        assert.equal(await descriptionTrigger.evaluate(el=>document.activeElement===el),true,
          "closing dialog with Escape must restore focus to its trigger");
        setPhase(desktopPage,"desktop long-description viewport / reload");
        await desktopPage.setViewportSize({width:1440,height:900});
        await desktopPage.reload();
        await desktopPage.locator('.wd-hero-summary button[aria-haspopup="dialog"]').waitFor();
        await capture(desktopPage,"07-desktop-long-cover.png",{fullPage:true});
        diagnostics.viewportChecks.desktopLong=await layout(desktopPage);
        if(diagnostics.viewportChecks.desktopLong.scrollWidth>1441)
          diagnostics.violations.push('long description causes desktop horizontal overflow');
        // Data-state edges: both partial and complete reading must be truthful.
        for(const [n,code] of [[1,1],[2,2]]) {
          await pool.query(`INSERT INTO user_chapter_reads(user_id,chapter_id)
            SELECT $1,id FROM chapters WHERE comic_id=$2 AND sort_order=$3 AND status='RELEASED'
            ON CONFLICT DO NOTHING`,[user,comic,code]);
          setPhase(desktopPage,`progress ${n}/2 reload`);
          await desktopPage.reload();
          await desktopPage.locator('.wd-hero-progress').getByText(`Прочитано: ${n} из 2`).waitFor();
          await capture(desktopPage,`08-desktop-read-${n}-of-2.png`);
        }
      } finally {
        await pool.query("DELETE FROM user_chapter_reads WHERE user_id=$1 AND chapter_id IN (SELECT id FROM chapters WHERE comic_id=$2)",[user,comic]);
        await pool.query("UPDATE comics SET description='Описание истории',cover_url=NULL WHERE id=$1",[comic]);
      }
      // Record the dev issue without treating a mere dev indicator as proof
      // of a production defect. Genuine JavaScript exceptions fail CI.
      for (const [label,events] of Object.entries(diagnostics.browserEvents)) {
        if(events.pageErrors.length) diagnostics.violations.push(`${label}: ${events.pageErrors.length} page error(s)`);
        const hydrationWarnings=events.consoleErrors.filter(message =>
          /a tree hydrated but some attributes|hydration failed|text content does not match server-rendered html/i.test(message));
        if(hydrationWarnings.length) diagnostics.violations.push(`${label}: ${hydrationWarnings.length} hydration warning(s)`);
      }
    } finally {
      if(controlContext) await controlContext.close();
      if(mobileContext) await mobileContext.close();
      if(desktopContext) await desktopContext.close();
      await writeFile(join(screenshots,"wd-hero-02b-diagnostics.json"),
        JSON.stringify(diagnostics,null,2)+"\n","utf8");
      console.log("WD_HERO_02B_DIAGNOSTICS="+JSON.stringify({
        violations:diagnostics.violations,devOverlay:diagnostics.devOverlay.beforeClick,
        screenshotDirectory:screenshots}));
    }
    assert.deepEqual(diagnostics.violations,[],"WD-HERO-02B: viewport or browser failures; see uploaded diagnostic JSON");
    console.log("WD_HERO_02B_VISUAL_QA=PASS");
  }
  await chapters.getByRole("checkbox",{name:/Скрыть запланированные/}).check();
  assert.equal(await chapters.locator(".wd-row--scheduled").count(), 0);
  await chapters.getByRole("checkbox",{name:/Скрыть запланированные/}).uncheck();
  await planned.getByText("Просыпание", { exact: true }).waitFor();
  // Public visitor also sees the announcement, but no reading link or controls.
  const guest=await browser.newContext({viewport:{width:360,height:800}});
  const guestPage=await guest.newPage();
  await guestPage.goto(url+"#chapters");
  const guestPlanned=guestPage.locator(".wd-row--scheduled");
  await guestPlanned.getByText("Просыпание", { exact: true }).waitFor();
  assert.equal(await guestPlanned.locator("a, button").count(), 0);
  assert.equal((await guestPage.request.get(origin+"/api/comics/"+comic+"/chapters").then(r=>r.json())).chapters.find(c=>c.status==="SCHEDULED").sourceUrl,null);
  await guest.close();
  await page.evaluate(()=>{window.readerDocument="kept";});
  const mark=chapters.getByRole("button",{name:/Отметить прочитанной: 1/});
  // Rejection must roll the check back and leave an explicit retry.
  await page.route("**/api/library/reading-state",r=>r.fulfill({status:503,body:"retry"}),{times:1});
  await mark.click();
  await heroProgress.getByText("Прочитано: 0 из 2").waitFor();
  await chapters.getByRole("button",{name:"Повторить"}).click();
  await heroProgress.getByText("Прочитано: 1 из 2").waitFor();
  assert.equal(await heroProgress.getByRole("progressbar",{name:"Прогресс чтения"}).getAttribute("value"),"1");
  const sheet=page.getByRole("dialog",{name:"Охота на быка"});
  await sheet.waitFor();
  // Layout coordinates ignore the hover scale transform applied to rating stars.
  const stars=await sheet.locator(".wd-stars button").evaluateAll(nodes=>nodes.map(n=>n.offsetTop));
  assert.equal(stars.length,5);assert.equal(new Set(stars).size,1);
  await sheet.getByRole("button",{name:"4 из 5"}).hover();
  assert.deepEqual(await sheet.locator(".wd-stars button").allTextContents(),["★","★","★","★","☆"]);
  await sheet.getByRole("button",{name:"2 из 5"}).hover();
  assert.deepEqual(await sheet.locator(".wd-stars button").allTextContents(),["★","★","☆","☆","☆"]);
  await sheet.locator("h2").hover();
  assert.deepEqual(await sheet.locator(".wd-stars button").allTextContents(),["☆","☆","☆","☆","☆"]);
  await sheet.getByRole("checkbox").check();
  await sheet.getByRole("button",{name:"4 из 5"}).click();
  await sheet.getByText("Оценка сохранена").waitFor();
  assert.deepEqual(await sheet.locator(".wd-stars button").allTextContents(),["★","★","★","★","☆"]);
  await chapters.getByRole("button",{name:/Оценить: 1/}).filter({hasText:"4"}).waitFor();
  await sheet.getByRole("button",{name:"Закрыть окно оценки главы"}).click();
  // WD-LINK-02: chapter destinations moved out of the hero. Reading one chapter
  // must not remove or repoint the other chapter links in the Chapters tab.
  assert.equal(await page.locator(".wd-read").count(), 0);
  const firstChapterLink = chapters.getByRole("link", {name:"1 · Охота на быка — открыть главу в новой вкладке"});
  assert.equal(await firstChapterLink.getAttribute("href"), "https://example.com/one");
  const secondChapterLink = chapters.getByRole("link", {name:"УРГА — открыть главу в новой вкладке"});
  assert.equal(await secondChapterLink.getAttribute("href"), "https://example.com/two");
  assert.equal(await secondChapterLink.getAttribute("target"), "_blank");
  // A discoverable general source remains available even if every released
  // chapter also has its own direct link.
  const sharedWorkSource = chapters.getByRole("link", {name:"Открыть источник ↗"});
  assert.equal(await sharedWorkSource.getAttribute("href"), "https://example.com/book");
  await page.getByRole("tab",{name:"Мой дневник"}).click();
  assert.equal(await diary.locator("textarea").inputValue(),"Моя заметка");
  assert.equal(await page.evaluate(()=>window.readerDocument),"kept");
  // WD16: ratings are independent of chapter stars and survive failed saves, tabs and reloads.
  const review=diary.locator(".wd-review");
  const plot=review.getByRole("group",{name:"Сюжет"});
  await plot.getByRole("button",{name:"Сюжет: 4 из 5"}).hover();
  assert.deepEqual(await plot.locator(".wd-review-star").allTextContents(),["★","★","★","★","☆"]);
  await review.getByText("Моя оценка произведения").hover();
  assert.deepEqual(await plot.locator(".wd-review-star").allTextContents(),["☆","☆","☆","☆","☆"]);
  await plot.getByRole("button",{name:"Сюжет: 4 из 5"}).click();
  assert.equal(await plot.getByRole("button",{name:"Сюжет: 4 из 5"}).getAttribute("aria-pressed"),"true");
  await review.getByText("Оценено 1 из 5").waitFor();
  await review.getByRole("group",{name:"Рисовка"}).getByRole("button",{name:"Рисовка: 5 из 5"}).click();
  await review.getByRole("group",{name:"Мир"}).getByRole("button",{name:"Мир: 3 из 5"}).click();
  await review.getByText("Оценено 3 из 5").waitFor();
  assert.equal(await review.locator(".wd-review-average strong").textContent(),"4,0");
  await page.getByRole("tab",{name:/Главы/}).click();
  await page.getByRole("tab",{name:"Мой дневник"}).click();
  assert.equal(await plot.getByRole("button",{name:"Сюжет: 4 из 5"}).getAttribute("aria-pressed"),"true");
  assert.equal(await diary.locator("textarea").inputValue(),"Моя заметка");
  await page.route("**/api/library/reading-state",r=>r.fulfill({status:503,body:"retry"}),{times:1});
  await review.getByRole("button",{name:"Сохранить оценку и заметку"}).click();
  await diary.getByRole("alert").waitFor();
  assert.match(await diary.getByRole("alert").textContent(),/Не удалось сохранить/);
  assert.equal(await diary.locator("textarea").inputValue(),"Моя заметка");
  assert.equal(await plot.getByRole("button",{name:"Сюжет: 4 из 5"}).getAttribute("aria-pressed"),"true");
  await review.getByRole("button",{name:"Сохранить оценку и заметку"}).click();
  await diary.getByText("Оценка и заметка сохранены").waitFor();
  const stored=(await pool.query("SELECT rating_plot,rating_characters,rating_art,rating_depth,rating_world,personal_note FROM user_comics WHERE comic_id=$1 AND user_id=$2",[comic,user])).rows[0];
  assert.deepEqual(stored,{rating_plot:4,rating_characters:null,rating_art:5,rating_depth:null,rating_world:3,personal_note:"Моя заметка"});
  await page.reload();await diary.waitFor();
  assert.equal(await diary.getByRole("group",{name:"Сюжет"}).getByRole("button",{name:"Сюжет: 4 из 5"}).getAttribute("aria-pressed"),"true");
  assert.equal(await diary.locator("textarea").inputValue(),"Моя заметка");
  await diary.getByRole("group",{name:"Сюжет"}).getByRole("button",{name:"Убрать оценку: Сюжет"}).click();
  await diary.getByText("Оценено 2 из 5").waitFor();
  await diary.getByRole("button",{name:"Сохранить оценку и заметку"}).click();
  await diary.getByText("Оценка и заметка сохранены").waitFor();
  assert.equal((await pool.query("SELECT rating_plot FROM user_comics WHERE comic_id=$1 AND user_id=$2",[comic,user])).rows[0].rating_plot,null);
  assert.equal(await diary.getByRole("checkbox",{name:/Предлагать оценку главы/}).isChecked(),false);
  await page.getByRole("tab",{name:/Главы/}).click();
  await chapters.getByRole("button",{name:"Отметить прочитанной: УРГА"}).click();
  await chapters.getByRole("button",{name:"Снять отметку: УРГА",disabled:false}).waitFor();
  await heroProgress.getByText("Прочитано: 2 из 2").waitFor();
  await heroProgress.getByText("Все вышедшие основные главы прочитаны.").waitFor();
  assert.equal(await page.locator("dialog[open]").count(),0);
  await chapters.getByRole("button",{name:"Оценить: УРГА"}).click();
  await page.getByRole("dialog",{name:"УРГА"}).waitFor();
  await page.getByRole("dialog",{name:"УРГА"}).getByRole("button",{name:"Закрыть окно оценки главы"}).click();
  await page.getByRole("tab",{name:"Мой дневник"}).click();
  await diary.getByRole("checkbox",{name:/Предлагать оценку главы/}).check();
  await page.getByRole("tab",{name:/Главы/}).click();
  await pool.query("INSERT INTO chapters(comic_id,display_code,title,sort_order,status,volume_number) VALUES ($1,'4','Долина',4,'RELEASED',1),($1,'5','Река',5,'RELEASED',2),($1,'6','Лес',6,'RELEASED',2)",[comic]);
  await page.reload();
  const latest = page.getByRole("tabpanel",{name:/Главы/});
  const volumeBeforeBulk = latest.locator(".wd-volume").filter({hasText:"Том 2"});
  if (!(await volumeBeforeBulk.evaluate(node => node.open))) {
    await volumeBeforeBulk.locator("summary").click();
  }
  assert.equal(await volumeBeforeBulk.evaluate(node => node.open), true, "Tom 2 must be expanded before marking chapter 6");
  await latest.getByRole("button",{name:"Отметить прочитанной: 6 · Лес"}).click();
  const bulk = page.locator("dialog.wd-bulk-sheet[open]");
  await bulk.getByRole("heading",{name:"Отметить предыдущие главы?"}).waitFor();
  await bulk.getByText("4 · Долина").waitFor();
  await bulk.getByText("5 · Река").waitFor();
  await bulk.getByRole("button",{name:"Отметить предыдущие (2)"}).click();
  await bulk.getByRole("heading",{name:"Готово! Хотите оценить?"}).waitFor();
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM user_chapter_reads WHERE user_id=$1 AND chapter_id IN (SELECT id FROM chapters WHERE comic_id=$2 AND display_code IN ('4','5','6'))",[user,comic])).rows[0].count,3);
  await bulk.getByRole("button",{name:"4 · Долина: 4 из 5"}).click();
  await bulk.getByRole("button",{name:"6 · Лес: 3 из 5"}).click();
  await page.route("**/api/library/reading-state",r=>r.fulfill({status:503,body:"retry"}),{times:1});
  await bulk.getByRole("button",{name:"Сохранить выбранные оценки (2)"}).click();
  await bulk.getByRole("alert").waitFor();
  assert.equal(await bulk.getByRole("button",{name:"4 · Долина: 4 из 5"}).getAttribute("aria-pressed"),"true");
  await bulk.getByRole("button",{name:"Сохранить выбранные оценки (2)"}).click();
  await bulk.getByRole("heading",{name:"Оценки сохранены"}).waitFor();
  const ratingsAfterBulk = (await pool.query("SELECT display_code,rating FROM chapters JOIN user_chapter_reads ON chapters.id=user_chapter_reads.chapter_id WHERE user_chapter_reads.user_id=$1 AND chapters.comic_id=$2 AND chapters.display_code IN ('4','5','6') ORDER BY display_code",[user,comic])).rows;
  assert.deepEqual(ratingsAfterBulk,[{display_code:"4",rating:4},{display_code:"5",rating:null},{display_code:"6",rating:3}]);
  await bulk.getByRole("button",{name:"Готово"}).click();
  // Undo removes only the new earlier mark, never the clicked target nor existing marks.
  await pool.query("INSERT INTO chapters(comic_id,display_code,title,sort_order,status,volume_number) VALUES ($1,'7','Пещера',7,'RELEASED',2),($1,'8','Гроза',8,'RELEASED',2)",[comic]);
  await page.reload();
  const after=page.getByRole("tabpanel",{name:/Главы/});
  const volumeBeforeUndo = after.locator(".wd-volume").filter({hasText:"Том 2"});
  if (!(await volumeBeforeUndo.evaluate(node => node.open))) {
    await volumeBeforeUndo.locator("summary").click();
  }
  assert.equal(await volumeBeforeUndo.evaluate(node => node.open), true, "Tom 2 must be expanded before marking chapter 8");
  await after.getByRole("button",{name:"Отметить прочитанной: 8 · Гроза"}).click();
  const undoDialog=page.locator("dialog.wd-bulk-sheet[open]");
  await undoDialog.getByRole("heading",{name:"Отметить предыдущие главы?"}).waitFor();
  await undoDialog.getByRole("button",{name:"Отметить предыдущие (1)"}).click();
  await undoDialog.getByRole("button",{name:"Отменить массовую отметку"}).click();
  await undoDialog.getByRole("heading",{name:"Отметки отменены"}).waitFor();
  const undone=(await pool.query("SELECT display_code FROM chapters JOIN user_chapter_reads ON chapters.id=user_chapter_reads.chapter_id WHERE user_chapter_reads.user_id=$1 AND chapters.comic_id=$2 AND chapters.display_code IN ('7','8') ORDER BY display_code",[user,comic])).rows.map(r=>r.display_code);
  assert.deepEqual(undone,["8"]);
  await undoDialog.getByRole("button",{name:"Готово"}).click();
  // WD-LINK-02: no direct link must lead to the explicitly labeled general
  // work source, not to a later chapter. Then no URLs means no phantom link,
  // while marking a released chapter as read still remains possible.
  const updatedChapter = await pool.query("UPDATE chapters SET source_url=NULL WHERE comic_id=$1 AND title='УРГА' RETURNING id,source_url", [comic]);
  assert.equal(updatedChapter.rowCount, 1, "WD-LINK-02: expected to update exactly one chapter URL");
  assert.equal(updatedChapter.rows[0].source_url, null);
  // The browser can already be at this exact #chapters URL. A same-URL goto
  // is not a reliable refresh of server-rendered data after an external SQL write.
  await page.reload();
  const fallbackPanel = page.getByRole("tabpanel", {name:/Главы/});
  const fallbackGroup = fallbackPanel.locator(".wd-volume").filter({hasText:"Главы без тома"});
  await fallbackGroup.locator("summary").waitFor();
  if (!(await fallbackGroup.evaluate(node => node.open))) await fallbackGroup.locator("summary").click();
  const fallbackRow = fallbackPanel.locator("li.wd-row").filter({hasText:"УРГА"});
  const fallbackSource = fallbackRow.getByRole("link", {name:"УРГА — открыть общий источник произведения в новой вкладке"});
  try {
    await fallbackSource.waitFor({timeout:6000});
  } catch (error) {
    // The test uses synthetic example.com URLs; never print cookies or tokens.
    console.error("WD_LINK_02_FALLBACK_DIAGNOSTICS=" + JSON.stringify({
      panelHidden: await fallbackPanel.getAttribute("hidden"),
      groupOpen: await fallbackGroup.evaluate(node => node.open),
      rows: (await fallbackRow.allTextContents()).map(text => text.trim().slice(0,180)),
      links: await fallbackRow.locator("a").evaluateAll(nodes => nodes.map(node => ({
        label: node.getAttribute("aria-label"), href: node.getAttribute("href"),
      }))),
      commonSourceCount: await fallbackPanel.getByText("Общий источник произведения", {exact:true}).count(),
    }));
    throw error;
  }
  assert.equal(await fallbackSource.getAttribute("href"), "https://example.com/book");
  assert.equal(await fallbackRow.getByRole("link", {name:"УРГА — открыть главу в новой вкладке"}).count(), 0);
  const updatedWork = await pool.query("UPDATE comics SET source_url=NULL WHERE id=$1 RETURNING source_url", [comic]);
  assert.equal(updatedWork.rowCount, 1, "WD-LINK-02: expected to update exactly one work URL");
  assert.equal(updatedWork.rows[0].source_url, null);
  await page.reload();
  const noSourcePanel = page.getByRole("tabpanel", {name:/Главы/});
  const noSourceGroup = noSourcePanel.locator(".wd-volume").filter({hasText:"Главы без тома"});
  await noSourceGroup.locator("summary").waitFor();
  if (!(await noSourceGroup.evaluate(node => node.open))) await noSourceGroup.locator("summary").click();
  const noSourceRow = noSourcePanel.locator("li.wd-row").filter({hasText:"УРГА"});
  try {
    await noSourceRow.getByText("Ссылка на чтение пока не добавлена. Главу можно найти самостоятельно.").waitFor({timeout:6000});
  } catch (error) {
    console.error("WD_LINK_02_MISSING_DIAGNOSTICS=" + JSON.stringify({
      panelHidden: await noSourcePanel.getAttribute("hidden"),
      groupOpen: await noSourceGroup.evaluate(node => node.open),
      rows: (await noSourceRow.allTextContents()).map(text => text.trim().slice(0,180)),
      links: await noSourceRow.locator("a").evaluateAll(nodes => nodes.map(node => ({
        label: node.getAttribute("aria-label"), href: node.getAttribute("href"),
      }))),
      commonSourceCount: await noSourcePanel.getByText("Общий источник произведения", {exact:true}).count(),
    }));
    throw error;
  }
  assert.equal(await noSourceRow.locator("a").count(), 0);
  assert.equal(await noSourcePanel.getByText("Общий источник произведения", {exact:true}).count(), 0);
  assert.equal(await noSourceRow.getByRole("button", {name:"Снять отметку: УРГА"}).count(), 1);
  console.log("PASS: WD-LINK-02 direct links, persistent general source, fallback, and missing-link read controls");
  console.log("PASS: WD18.2 smart prompt, one-request bulk marks, optional batch ratings, retry and undo");
  console.log("PASS: WD12-WD16 and WD21.3 planned chapters, guest visibility, read/rating guards, toggle, persistence and mobile sheet");
} finally {
  try {
    await browser?.close();
    // User deletion cascades to reading marks; chapters can then be removed safely.
    if(user)await pool.query("DELETE FROM users WHERE id=$1",[user]);
    if(comic)await pool.query("DELETE FROM comics WHERE id=$1",[comic]);
  } finally {
    await pool.end();
  }
}
