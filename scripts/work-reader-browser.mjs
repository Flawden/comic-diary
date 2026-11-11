// End-to-end check against the disposable CI database and the real Next app.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
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
  await page.getByText("Описание истории",{exact:true}).waitFor();
  await page.getByRole("tab",{name:/Главы/}).click();
  const chapters=page.getByRole("tabpanel",{name:/Главы/});
  const planned=chapters.locator(".wd-row--scheduled");
  await planned.getByText("3 · Просыпание").waitFor();
  await planned.getByText("Ожидается: ноябрь 2026 г.").waitFor();
  assert.equal(await planned.locator("a, button").count(), 0);
  assert.equal(await chapters.getByText("Прочитано: 0 из 2").count(), 1);
  await chapters.getByRole("checkbox",{name:/Скрыть запланированные/}).check();
  assert.equal(await chapters.locator(".wd-row--scheduled").count(), 0);
  await chapters.getByRole("checkbox",{name:/Скрыть запланированные/}).uncheck();
  await planned.getByText("3 · Просыпание").waitFor();
  // Public visitor also sees the announcement, but no reading link or controls.
  const guest=await browser.newContext({viewport:{width:360,height:800}});
  const guestPage=await guest.newPage();
  await guestPage.goto(url+"#chapters");
  const guestPlanned=guestPage.locator(".wd-row--scheduled");
  await guestPlanned.getByText("3 · Просыпание").waitFor();
  assert.equal(await guestPlanned.locator("a, button").count(), 0);
  assert.equal((await guestPage.request.get(origin+"/api/comics/"+comic+"/chapters").then(r=>r.json())).chapters.find(c=>c.status==="SCHEDULED").sourceUrl,null);
  await guest.close();
  await page.evaluate(()=>{window.readerDocument="kept";});
  const mark=chapters.getByRole("button",{name:/Отметить прочитанной: 1/});
  // Rejection must roll the check back and leave an explicit retry.
  await page.route("**/api/library/reading-state",r=>r.fulfill({status:503,body:"retry"}),{times:1});
  await mark.click();
  await chapters.getByRole("button",{name:"Повторить"}).click();
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
  await page.getByText("Все вышедшие основные главы прочитаны.").waitFor();
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
  await latest.locator(".wd-volume").filter({hasText:"Том 2"}).locator("summary").click();
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
  await after.locator(".wd-volume").filter({hasText:"Том 2"}).locator("summary").click();
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
  await pool.query("UPDATE chapters SET source_url=NULL WHERE comic_id=$1 AND title='УРГА'", [comic]);
  await page.goto(url+"#chapters");
  const fallbackPanel = page.getByRole("tabpanel", {name:/Главы/});
  const fallbackRow = fallbackPanel.locator("li.wd-row").filter({hasText:"УРГА"});
  const fallbackSource = fallbackRow.getByRole("link", {name:"УРГА — открыть общий источник произведения в новой вкладке"});
  await fallbackSource.waitFor();
  assert.equal(await fallbackSource.getAttribute("href"), "https://example.com/book");
  assert.equal(await fallbackRow.getByRole("link", {name:"УРГА — открыть главу в новой вкладке"}).count(), 0);
  await pool.query("UPDATE comics SET source_url=NULL WHERE id=$1", [comic]);
  await page.reload();
  const noSourcePanel = page.getByRole("tabpanel", {name:/Главы/});
  const noSourceRow = noSourcePanel.locator("li.wd-row").filter({hasText:"УРГА"});
  await noSourceRow.getByText("Ссылка на чтение пока не добавлена. Главу можно найти самостоятельно.").waitFor();
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
