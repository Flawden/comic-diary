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
  // WD18: the updates feed expands unread chapters in place, grouped by volume.
  // A scheduled chapter must not appear in the feed or be marked as read there.
  await pool.query("UPDATE chapters SET volume_number=1 WHERE comic_id=$1 AND status='RELEASED'",[comic]);
  await page.goto(origin+"/updates");
  const updateCard=page.locator(".updates-item").filter({hasText:"Мезолит"});
  await updateCard.getByRole("button",{name:"Показать непрочитанные главы · 2"}).click();
  const firstVolume=updateCard.locator(".updates-volume").first();
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
  await page.getByRole("button",{name:"Снять последнюю отметку"}).click();
  await page.getByText("Отметка снята.").waitFor();
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM user_chapter_reads WHERE user_id=$1",[user])).rows[0].count,0);
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
  assert.equal(await page.locator(".wd-read").getAttribute("href"),"https://example.com/two");
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
