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
  await pool.query("INSERT INTO chapters(comic_id,display_code,title,source_url,sort_order,status) VALUES ($1,'1','Охота на быка','https://example.com/one',1,'RELEASED'),($1,'','УРГА','https://example.com/two',2,'RELEASED')",[comic]);
  browser=await chromium.launch({channel:"chrome",headless:true});
  const ctx=await browser.newContext({viewport:{width:360,height:800}});
  await ctx.addCookies([{name:"comic_diary_session",value:token,url:origin}]);
  const page=await ctx.newPage();
  page.setDefaultTimeout(25000);
  const url=origin+"/comics/"+prefix;
  await page.goto(url+"#my-reading");
  const diary=page.getByRole("tabpanel",{name:"Мой дневник"});
  await diary.waitFor();
  await diary.locator(".wd-edit").filter({hasText:"Личная заметка"}).locator("summary").click();
  await diary.locator("textarea").fill("Моя заметка");
  await page.getByRole("tab",{name:"Об истории"}).click();
  await page.getByText("Описание истории",{exact:true}).waitFor();
  await page.getByRole("tab",{name:/Главы/}).click();
  const chapters=page.getByRole("tabpanel",{name:/Главы/});
  await page.evaluate(()=>{window.readerDocument="kept";});
  const mark=chapters.getByRole("button",{name:/Отметить прочитанной: 1/});
  // Rejection must roll the check back and leave an explicit retry.
  await page.route("**/api/library/reading-state",r=>r.fulfill({status:503,body:"retry"}),{times:1});
  await mark.click();
  await chapters.getByRole("button",{name:"Повторить"}).click();
  const sheet=page.getByRole("dialog",{name:"Охота на быка"});
  await sheet.waitFor();
  const stars=await sheet.locator(".wd-stars button").evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
  assert.equal(stars.length,5);assert.equal(new Set(stars).size,1);
  await sheet.getByRole("checkbox").check();
  await sheet.getByRole("button",{name:"4 из 5"}).click();
  await chapters.getByRole("button",{name:/Оценить: 1/}).filter({hasText:"4"}).waitFor();
  assert.equal(await page.locator(".wd-read").getAttribute("href"),"https://example.com/two");
  await page.getByRole("tab",{name:"Мой дневник"}).click();
  assert.equal(await diary.locator("textarea").inputValue(),"Моя заметка");
  assert.equal(await page.evaluate(()=>window.readerDocument),"kept");
  await page.reload();await diary.waitFor();
  assert.equal(await diary.getByRole("checkbox",{name:/Предлагать оценку главы/}).isChecked(),false);
  await page.getByRole("tab",{name:/Главы/}).click();
  await chapters.getByRole("button",{name:"Отметить прочитанной: УРГА"}).click();
  await chapters.getByRole("button",{name:"Снять отметку: УРГА",disabled:false}).waitFor();
  await page.getByText("Все вышедшие основные главы прочитаны.").waitFor();
  assert.equal(await page.locator("dialog[open]").count(),0);
  await chapters.getByRole("button",{name:"Оценить: УРГА"}).click();
  await page.getByRole("dialog",{name:"УРГА"}).waitFor();
  console.log("PASS: tabs, mobile rating sheet, AJAX rollback/retry, drafts, preference and direct links");
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
