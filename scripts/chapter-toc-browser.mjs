/** Compiled UI, disposable PG17, synthetic readers; provider HTTP stays blocked. */
import assert from 'node:assert/strict';
import {randomUUID, randomBytes, createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Pool} from 'pg';
const target=new URL(process.env.PRESENTATION_TEST_DATABASE_URL??'');
const local=target.hostname==='127.0.0.1'&&target.port==='55576'&&target.username==='comic_diary_ci'&&target.pathname==='/comic_diary_release';
const ci=process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='Flawden/comic-diary'&&target.hostname==='127.0.0.1'&&target.port==='5432'&&target.username==='comic_diary_ci'&&target.pathname==='/comic_diary_release';
if(target.protocol!=='postgresql:'||(!local&&!ci)||target.search||target.hash)throw Error('Refused non-disposable target');
const origin='http://127.0.0.1:3120',canonical='https://reader.example.invalid';
const {chromium}=createRequire(resolve(process.env.WD_BROWSER_ROOT??'.qa/browser-deps','package.json'))('playwright-core');
const out=resolve(process.env.TOC_BROWSER_OUTPUT??'.qa/toc-browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.TOC_BROWSER_EXECUTABLE?{executablePath:process.env.TOC_BROWSER_EXECUTABLE}:{channel:'chrome'})});
const pool=new Pool({connectionString:target.href}),q=(s,v=[])=>pool.query(s,v),users=[],books=[],contexts=[],prefix='toc-'+randomUUID();
const result={status:'PENDING',checks:[],screenshots:[],errors:[],external:[],assetErrors:[]};
const policy=(await q('SELECT beta_only FROM site_access_policy WHERE id=1')).rows[0];
const controls=(await q('SELECT row_to_json(t) r FROM activation_mail_dispatch_control t UNION ALL SELECT row_to_json(t) FROM password_reset_mail_dispatch_control t')).rows;
async function context(token,theme,width){
 const c=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});contexts.push(c);
 await c.addCookies([{name:'comic_diary_session',value:token,url:origin},{name:'comic-diary-theme',value:theme,url:origin}]);
 await c.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());
  if(u.origin!==origin){result.external.push({origin:u.origin,type:r.resourceType()});return route.abort();}
  if(u.pathname.startsWith('/api/')){
   const headers={...(await r.allHeaders()),host:'reader.example.invalid','x-real-ip':'192.0.2.88'};
   if(!['GET','HEAD'].includes(r.method()))headers.origin=canonical;
   const response=await c.request.fetch(r.url(),{method:r.method(),headers,data:r.postDataBuffer(),maxRedirects:0});
   return route.fulfill({response});
  }return route.continue();
 });c.on('response',r=>{if(r.status()>=400&&['font','stylesheet','script','image'].includes(r.request().resourceType()))result.assetErrors.push({path:new URL(r.url()).pathname,status:r.status()});});c.on('page',p=>p.on('pageerror',e=>result.errors.push({url:p.url(),message:e.message})));return c;
}
async function chapter(book,code,title,order,{status='RELEASED',kind='MAIN',pages=null,minutes=null,volume=null}={}){
 return (await q("INSERT INTO chapters(comic_id,display_code,title,sort_order,status,kind,page_count,reading_minutes,volume_number,source_url,cover_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'https://example.invalid/chapter','/images/fantasy-editorial/catalog/catalog-library-background.webp') RETURNING id",[book,code,title,order,status,kind,pages,minutes,volume])).rows[0].id;
}
try{
 await q('UPDATE site_access_policy SET beta_only=false WHERE id=1');
 for(let i=0;i<3;i++)users.push((await q("INSERT INTO users(email,password_hash,display_name,email_verified_at) VALUES($1,'unused-synthetic','Проверка оглавления',now()) RETURNING id",[prefix+'-'+i+'@example.invalid'])).rows[0].id);
 const user=users[0],token=randomBytes(32).toString('base64url');await q("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[user,createHash('sha256').update(token).digest('hex')]);
 for(const [suffix,title] of [['single','Снежная история без разбивки на тома'],['paged','Большая история с продолжением']])books.push((await q("INSERT INTO comics(slug,title,cover_url) VALUES($1,$2,'/demo/covers/tea.svg') RETURNING id",[prefix+'-'+suffix,title])).rows[0].id);
 const [single,paged]=books,ids=[];
 ids.push(await chapter(single,'1','Первая глава с очень длинным названием о путешествии через зимний лес',0,{pages:20,minutes:3}));
 ids.push(await chapter(single,'2','Тайна леса',1,{pages:30,minutes:4}));
 ids.push(await chapter(single,'3','Возвращение',2,{pages:50,minutes:5}));
 const special=await chapter(single,'Бонус','Дополнительная история',3,{kind:'SPECIAL',pages:999});
 await chapter(single,'4','Ожидаемая глава',4,{status:'SCHEDULED',pages:200});
 const archived=await chapter(single,'Старая редакция','Архивная история',5,{status:'ARCHIVED',pages:500});
 for(let i=0;i<33;i++)await chapter(paged,String(i+1),'Продолжение '+(i+1),i,{pages:1,minutes:1});
 await chapter(paged,'Дополнение','Видимый бонус после пагинации',34,{kind:'SPECIAL',pages:777});
 for(const book of books)await q('INSERT INTO user_comics(user_id,comic_id,prompt_chapter_rating) VALUES($1,$2,false)',[user,book]);
 await q('INSERT INTO user_chapter_reads(user_id,chapter_id,rating) VALUES($1,$2,4)',[user,archived]);
 for(const id of ids.slice(0,2))await q('INSERT INTO user_chapter_reads(user_id,chapter_id,rating) VALUES($1,$2,5)',[users[1],id]);
 await q('INSERT INTO user_chapter_reads(user_id,chapter_id,rating) VALUES($1,$2,1)',[users[2],ids[0]]);
 for(const theme of ['tea','paper','night'])for(const width of [320,390,1440]){
  await q('DELETE FROM user_chapter_reads WHERE user_id=$1 AND chapter_id=ANY($2::int[])',[user,[...ids,special]]);
  const c=await context(token,theme,width),p=await c.newPage();
  await p.goto(origin+'/comics/'+prefix+'-single#chapters',{waitUntil:'domcontentloaded'});
  const panel=p.getByRole('tabpanel',{name:/Главы/});await panel.locator('.wd-flat-summary').waitFor();
  assert.equal(await panel.locator('.wd08-intro,.wd-tools,.chapter-bulk').count(),0);
  assert.equal(await panel.locator('.wd08-external').count(),0);
  for(const link of await panel.locator('.wd-row-title>a').all())assert.equal((await link.textContent()).includes('↗'),false);
  const summary=panel.locator('.wd-flat-summary .wd-volume-summary');
  assert.match(await summary.textContent(),/100 стр/);assert.match(await summary.textContent(),/12 мин/);
  assert.match(await summary.textContent(),/Прочитано глав: 0 из 3/);assert.match(await summary.textContent(),/Страницы прочитанных глав: 0 из 100/);
  assert.match(await summary.textContent(),/3,0 \/ 5/);
  const specials=panel.locator('[data-chapter-section="special"]');await specials.getByRole('link',{name:/Дополнительная история.*открыть главу/}).waitFor();
  assert.equal(await specials.locator('.wd08-row').count(),1);
  assert.equal(await panel.locator('[data-chapter-section="main"] .wd-row--scheduled').count(),1);
  assert.equal(await p.locator('.wd-hero-progress progress').count(),1);
  assert.equal(await p.locator('.wd-hero-progress progress').getAttribute('max'),'3');
  assert.equal(await summary.locator('progress').count(),0);
  assert.match(await p.locator('.wd-hero-bonus-progress').textContent(),/0 из 1/);
  assert.equal(await specials.getByRole('progressbar',{name:'Прогресс дополнительных материалов'}).getAttribute('value'),'0');
  const search=panel.getByRole('searchbox',{name:'Поиск глав и спецвыпусков'});await search.fill('Тайна леса');
  assert.equal(await panel.locator('[data-chapter-section="main"] .wd08-row').count(),1);
  assert.match(await summary.textContent(),/100 стр/);assert.match(await summary.textContent(),/0 из 3/);
  await panel.getByRole('button',{name:'Сбросить поиск',exact:true}).click();
  const hide=panel.getByRole('checkbox',{name:/Скрыть запланированные/});await hide.check();
  assert.equal(await panel.locator('.wd-row--scheduled').count(),0);assert.match(await summary.textContent(),/100 стр/);await hide.uncheck();
  assert.equal(await panel.locator('.wd-row--scheduled').locator('a,button').count(),0);
  const row=panel.locator('[data-chapter-section="main"] .wd08-row').first();
  let saved=p.waitForResponse(r=>r.url().endsWith('/api/library/reading-state')&&r.request().method()==='POST');
  await row.getByRole('button',{name:/^Отметить прочитанной:/}).click();assert.equal((await saved).status(),200);
  await p.locator('.wd-hero-progress').getByText('Прочитано: 1 из 3 · 33%',{exact:true}).waitFor();
  await p.locator('.wd-hero-page-progress').getByText('20 из 100',{exact:true}).waitFor();
  assert.match(await summary.textContent(),/Страницы прочитанных глав: 20 из 100/);
  saved=p.waitForResponse(r=>r.url().endsWith('/api/library/reading-state')&&r.request().method()==='POST');
  await specials.getByRole('button',{name:/^Отметить прочитанной:/}).click();assert.equal((await saved).status(),200);
  await specials.getByRole('button',{name:/^Снять отметку:/}).waitFor();
  assert.match(await p.locator('.wd-hero-progress').textContent(),/Прочитано: 1 из 3/);
  assert.match(await p.locator('.wd-hero-bonus-progress').textContent(),/1 из 1/);
  assert.equal(await specials.getByRole('progressbar',{name:'Прогресс дополнительных материалов'}).getAttribute('value'),'1');
  assert.equal((await q('SELECT rating FROM user_chapter_reads WHERE user_id=$1 AND chapter_id=$2',[user,archived])).rows[0].rating,4);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.evaluate(()=>document.fonts.ready);
  const file=theme+'-'+width+'-single.png';await p.screenshot({path:resolve(out,file),fullPage:true});result.screenshots.push(file);
  result.checks.push(theme+'_'+width+'_VISIBLE_SPECIALS_ZERO_AND_OPTIMISTIC_PAGE_PROGRESS_SEARCH_PLANNED_ARCHIVE');
 }
 const c=await context(token,'night',390),p=await c.newPage();
 await q('UPDATE chapters SET volume_number=1 WHERE comic_id=$1 AND kind=\'MAIN\' AND status<>\'ARCHIVED\'',[single]);
 await p.goto(origin+'/comics/'+prefix+'-single#chapters',{waitUntil:'domcontentloaded'});
 await p.locator('.wd-volume summary').first().waitFor();
 assert.equal(await p.locator('.wd-volume summary progress').count(),0);
 await q('UPDATE chapters SET volume_number=2 WHERE id=$1',[ids[2]]);
 await p.reload({waitUntil:'domcontentloaded'});
 await p.locator('.wd-volume').nth(1).waitFor();
 assert.equal(await p.locator('.wd-volume summary progress').count(),2);
 result.checks.push('EXPLICIT_ONE_VOLUME_NO_DUPLICATE_BAR_TWO_VOLUMES_INDEPENDENT_BARS');
 await q('UPDATE chapters SET volume_number=NULL WHERE comic_id=$1',[single]);
 for(const id of ids)await q('INSERT INTO user_chapter_reads(user_id,chapter_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[user,id]);
 await chapter(single,'Бонус 2','Новый дополнительный материал',6,{kind:'SPECIAL',pages:17});
 await p.reload({waitUntil:'domcontentloaded'});
 await p.locator('.wd-hero-progress').getByText('Прочитано: 3 из 3 · 100%',{exact:true}).waitFor();
 assert.match(await p.locator('.wd-hero-bonus-progress').textContent(),/1 из 2/);
 assert.equal(await p.getByRole('progressbar',{name:'Прогресс дополнительных материалов'}).getAttribute('max'),'2');
 result.checks.push('ADDING_BONUS_PRESERVES_COMPLETED_MAIN_STORY_WITH_SEPARATE_BONUS_TOTAL');
 await q('UPDATE chapters SET page_count=NULL WHERE id=$1',[ids[1]]);
 await p.reload({waitUntil:'domcontentloaded'});
 await p.getByText('Страницы заполнены для 2 из 3 глав',{exact:true}).waitFor();
 assert.equal(await p.locator('.wd-hero-page-progress').count(),0);
 assert.equal(await p.locator('.wd-flat-summary progress').count(),0);
 await q('UPDATE chapters SET page_count=30 WHERE id=$1',[ids[1]]);
 await p.goto(origin+'/comics/'+prefix+'-paged#chapters',{waitUntil:'domcontentloaded'});
 const panel=p.getByRole('tabpanel',{name:/Главы/});await panel.locator('.wd-flat-summary').waitFor();
 assert.equal(await panel.locator('[data-chapter-section="main"] .wd08-row').count(),30);
 assert.equal(await panel.locator('[data-chapter-section="special"] .wd08-row').count(),1);
 assert.match(await panel.locator('.wd-flat-summary .wd-volume-summary').textContent(),/33 стр/);
 await panel.getByRole('link',{name:/Спецвыпуски и бонусы/}).click();
 await panel.getByRole('link',{name:/Видимый бонус после пагинации.*открыть главу/}).waitFor();
 await panel.getByRole('button',{name:'Показать ещё 30 глав',exact:true}).click();
 assert.equal(await panel.locator('[data-chapter-section="main"] .wd08-row').count(),33);
 assert.equal(await panel.locator('[data-chapter-section="special"] .wd08-row').count(),1);
 assert.match(await panel.locator('.wd-flat-summary .wd-volume-summary').textContent(),/33 стр/);
 result.checks.push('INCOMPLETE_PAGES_NO_FAKE_PERCENT_AND_INDEPENDENT_PAGINATION_33_MAIN_SPECIAL_VISIBLE');
 const onlySpecial=(await q("INSERT INTO comics(slug,title,cover_url) VALUES($1,'Только дополнительные материалы','/demo/covers/tea.svg') RETURNING id",[prefix+'-extras'])).rows[0].id;books.push(onlySpecial);
 await chapter(onlySpecial,'Дополнение','Единственный бонус',0,{kind:'SPECIAL',pages:9});
 await q('INSERT INTO user_comics(user_id,comic_id,prompt_chapter_rating) VALUES($1,$2,false)',[user,onlySpecial]);
 await p.goto(origin+'/comics/'+prefix+'-extras#chapters',{waitUntil:'domcontentloaded'});
 await p.locator('.wd-hero-bonus-progress').waitFor();
 assert.equal(await p.locator('.wd-hero-progress progress').count(),0);
 assert.match(await p.locator('.wd-hero-bonus-progress').textContent(),/0 из 1/);
 assert.equal(await p.getByRole('progressbar',{name:'Прогресс дополнительных материалов'}).getAttribute('max'),'1');
 result.checks.push('BONUS_ONLY_REGISTRY_NO_FAKE_MAIN_ZERO_DENOMINATOR');

 assert.deepEqual((await q('SELECT row_to_json(t) r FROM activation_mail_dispatch_control t UNION ALL SELECT row_to_json(t) FROM password_reset_mail_dispatch_control t')).rows,controls);
 assert.deepEqual(result.external,[]);assert.deepEqual(result.errors,[]);assert.deepEqual(result.assetErrors,[]);result.status='PASS';
}catch(e){result.status='FAIL';result.failure=String(e);throw e;}
finally{
 await writeFile(resolve(out,'RESULTS.json'),JSON.stringify(result,null,2));
 for(const c of contexts)await c.close();await browser.close();
 await q('UPDATE site_access_policy SET beta_only=$1 WHERE id=1',[policy.beta_only]);
 await q('DELETE FROM user_chapter_reads WHERE user_id=ANY($1::int[])',[users]);
 await q('DELETE FROM comics WHERE id=ANY($1::int[])',[books]);
 await q('DELETE FROM administrative_audit_events WHERE actor_user_id=ANY($1::int[])',[users]);
 await q('DELETE FROM users WHERE id=ANY($1::int[])',[users]);await pool.end();console.log(JSON.stringify(result));
}
