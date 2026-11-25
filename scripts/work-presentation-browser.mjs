/** Real UI + HTTP + synthetic PG, no provider HTTP. */
import assert from 'node:assert/strict';import {randomUUID,randomBytes,createHash} from 'node:crypto';import {createRequire} from 'node:module';import {resolve} from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';import {Pool} from 'pg';
const target=process.env.PRESENTATION_TEST_DATABASE_URL;if(!target)throw Error('explicit disposable target');const d=new URL(target),origin=process.env.PRESENTATION_BROWSER_ORIGIN??'http://127.0.0.1:3106',o=new URL(origin);
const local=d.hostname==='127.0.0.1'&&d.port==='55576'&&d.username==='comic_diary_ci'&&d.pathname==='/comic_diary_release';const ci=process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='Flawden/comic-diary'&&d.hostname==='127.0.0.1'&&d.port==='5432'&&d.username==='comic_diary_ci'&&d.pathname==='/comic_diary_release';if((!local&&!ci)||d.protocol!=='postgresql:'||d.search||d.hash||o.hostname!=='127.0.0.1'||o.port!=='3106')throw Error('REFUSED target');
const {chromium}=createRequire(resolve(process.env.WD_BROWSER_ROOT??'.qa/browser-deps','package.json'))('playwright-core');
const pool=new Pool({connectionString:target}),out=resolve(process.env.PRESENTATION_BROWSER_OUTPUT??'.qa/presentation-browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.REVIEWS_BROWSER_EXECUTABLE?{executablePath:process.env.REVIEWS_BROWSER_EXECUTABLE}:{channel:'chrome'})});
const result={status:'PENDING',checks:[],screenshots:[],errors:[],external:[]},users=[],books=[],contexts=[];let chapterIds=[],category;
const q=(s,v=[])=>pool.query(s,v);let book,slug,emptySlug,admin,user,staff;
async function context(token,theme='tea',width=1440){const c=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});contexts.push(c);if(token)await c.addCookies([{name:'comic_diary_session',value:token,url:origin}]);await c.addCookies([{name:'comic-diary-theme',value:theme,url:origin}]);await c.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){result.external.push(url.origin);return route.abort();}return route.continue();});c.on('page',p=>p.on('pageerror',e=>result.errors.push(e.message)));return c;}
try{
 category=(await q("INSERT INTO categories(slug,name) VALUES($1,'Чайная территория') RETURNING id",[randomUUID()])).rows[0].id;
 for(const role of ['ADMIN','EDITOR','USER']){const id=(await q("INSERT INTO users(email,password_hash,display_name,role,email_verified_at) VALUES($1,'unused-synthetic',$2,$3,now()) RETURNING id",[randomUUID()+'@example.invalid','Редактор '+role,role])).rows[0].id;users.push(id);const token=randomBytes(32).toString('base64url');await q("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[id,createHash('sha256').update(token).digest('hex')]);if(role==='ADMIN')admin={id,token};if(role==='EDITOR')staff={id,token};if(role==='USER')user={id,token};}
 slug='presentation-'+randomUUID();emptySlug=slug+'-empty';
 for(const [s,title] of [[slug,'Король лев — Храбрый маленький король и тайна далёкой долины'],[emptySlug,'История без оценок']])books.push((await q("INSERT INTO comics(slug,title,description,category_id,cover_url,banner_url,work_type,series_status) VALUES($1,$2,'История о взрослении, семье и дороге домой.',$3,'/demo/covers/tea.svg','/images/fantasy-editorial/catalog/catalog-library-background.webp','COMIC','ONGOING') RETURNING id",[s,title,category])).rows[0].id);
 book=books[0];
 for(let i=0;i<5;i++)chapterIds.push((await q("INSERT INTO chapters(comic_id,display_code,title,sort_order,status,volume_number,source_url,cover_url) VALUES($1,$2,$3,$4,'RELEASED',1,'https://example.invalid/chapter','/images/fantasy-editorial/catalog/catalog-library-background.webp') RETURNING id",[book,'Глава '+(i+1),['Короли настоящего и будущего','Тайна слоняющегося слонёнка','Соперничество братьев','Да здравствует король!','Тайна Рафики'][i],i])).rows[0].id);
 for(const [order,status,kind,volume] of [[6,'SCHEDULED','MAIN',1],[7,'RELEASED','MAIN',2],[8,'RELEASED','SPECIAL',1],[9,'ARCHIVED','MAIN',1]])await q("INSERT INTO chapters(comic_id,display_code,title,sort_order,status,kind,volume_number) VALUES($1,$2,'Дополнительная история',$3,$4,$5,$6)",[book,'Доп '+order,order,status,kind,volume]);
 await q("INSERT INTO comic_volume_titles(comic_id,volume_number,title) VALUES($1,1,'Храбрый маленький король')",[book]);
 await q('INSERT INTO user_comics(user_id,comic_id,in_library,tracking_enabled,rating_plot) VALUES($1,$2,true,true,1)',[user.id,book]);
 await q('INSERT INTO user_chapter_reads(user_id,chapter_id,rating) VALUES($1,$2,1)',[user.id,chapterIds[0]]);
 await q('INSERT INTO community_reviews(comic_id,chapter_id,user_id,rating) VALUES($1,$2,$3,4)',[book,chapterIds[0],user.id]);
 await q('INSERT INTO community_reviews(comic_id,user_id,rating_plot,rating_characters,rating_art,rating_depth,rating_world) VALUES($1,$2,5,4,3,4,5)',[book,user.id]);
 const anon=await context();assert.equal((await anon.request.get(origin+`/api/admin/catalog/comics/${book}/presentation`)).status(),401);
 const regular=await context(user.token);assert.equal((await regular.request.get(origin+`/api/admin/catalog/comics/${book}/presentation`)).status(),403);
 const ac=await context(admin.token);const endpoint=origin+`/api/admin/catalog/comics/${book}/presentation`;
 const ec=await context(staff.token);assert.equal((await ec.request.get(endpoint)).status(),200);await q('DELETE FROM sessions WHERE user_id=$1',[staff.id]);assert.equal((await ec.request.put(endpoint,{headers:{origin},data:{}})).status(),401);
 assert.equal((await regular.request.put(endpoint,{headers:{origin},data:{}})).status(),403);
 assert.equal((await ac.request.put(endpoint,{headers:{origin:'https://foreign.invalid'},data:{}})).status(),403);
 assert.equal((await ac.request.put(endpoint,{headers:{origin},data:{oversized:'x'.repeat(130*1024)}})).status(),413);
 const initial=await (await ac.request.get(endpoint)).json();assert.equal(initial.revision,0);
 const invalid=await ac.request.put(endpoint,{headers:{origin},data:{...initial,chapters:[{id:chapterIds[0],pageCount:0,readingMinutes:3}]}});assert.equal(invalid.status(),400);
 result.checks.push('HTTP_ANONYMOUS_USER_ORIGIN_AND_INVALID_VALUES=PASS');
 // This fixture's static illustration is not an uploaded /media/covers asset;
 // keep the chapter edited below on its supported null/fallback artwork path.
 await q('UPDATE chapters SET cover_url=NULL WHERE id=$1',[chapterIds[0]]);
 const page=await ac.newPage();await page.goto(origin+'/admin/comics',{waitUntil:'networkidle'});
 const card=page.locator('.admin-studio-navigator').getByRole('button').filter({hasText:'Король лев'});await card.click();
 const editor=page.locator('.presentation-admin:visible');await editor.locator('summary').click();await editor.getByLabel('Жанры',{exact:true}).waitFor();
 await editor.getByLabel('Возрастная маркировка').selectOption('12');await editor.getByLabel('Жанры',{exact:true}).fill('Приключения, Драма, Семья');
 for(let i=0;i<5;i++){const row=editor.locator('.presentation-admin-chapters>div').filter({hasText:['Короли настоящего и будущего','Тайна слоняющегося слонёнка','Соперничество братьев','Да здравствует король!','Тайна Рафики'][i]});await row.getByLabel('Страниц',{exact:true}).fill(String([24,28,22,26,30][i]));await row.getByLabel('Примерное время, мин',{exact:true}).fill('3');}
 const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url()===endpoint);await editor.getByRole('button',{name:'Сохранить сведения',exact:true}).click();assert.equal((await saved).status(),200);await editor.getByRole('status').filter({hasText:'Данные сохранены.'}).waitFor();
 const stored=await (await ac.request.get(endpoint)).json();assert.equal(stored.revision,1);assert.equal(stored.ageRating,12);assert.equal(stored.chapters.filter(c=>c.pageCount!==null).length,5);
 // Exercise the ordinary chapter dialog, not only the separate bulk metadata section.
 await page.getByRole('button',{name:'Главы',exact:true}).click();
 const firstCard=page.locator('.admin-chapter-card').filter({hasText:'Короли настоящего и будущего'});
 await firstCard.getByRole('button',{name:'Редактировать',exact:true}).click();
 const edit=page.getByRole('dialog',{name:/Редактирование главы:/});
 await edit.getByLabel(/^Количество страниц \(необязательно\)/).fill('25');
 await edit.getByLabel(/^Примерное время чтения, мин \(необязательно\)/).fill('3');
 await page.screenshot({path:resolve(out,'admin-edit-pages.png')});result.screenshots.push('admin-edit-pages.png');
 const chapterEndpoint=origin+`/api/admin/catalog/comics/${book}/chapters`;
 const invalidChapter={intent:'update',chapterId:chapterIds[0],displayCode:'Глава 1',title:'Короли настоящего и будущего',sourceUrl:'https://example.invalid/chapter',status:'RELEASED',releasedAt:null,pageCount:0,readingMinutes:3};
 assert.equal((await regular.request.patch(chapterEndpoint,{headers:{origin},data:{...invalidChapter,pageCount:99}})).status(),403);
 assert.equal((await ac.request.patch(chapterEndpoint,{headers:{origin},data:invalidChapter})).status(),400);
 assert.equal((await q('SELECT page_count FROM chapters WHERE id=$1',[chapterIds[0]])).rows[0].page_count,24);
 const updated=page.waitForResponse(r=>r.url()===chapterEndpoint&&r.request().method()==='PATCH');
 await edit.getByRole('button',{name:'Сохранить главу',exact:true}).click();assert.equal((await updated).status(),200);
 await edit.waitFor({state:'hidden'});
 assert.equal((await q('SELECT page_count FROM chapters WHERE id=$1',[chapterIds[0]])).rows[0].page_count,25);
 assert.equal((await ac.request.patch(chapterEndpoint,{headers:{origin},data:{...invalidChapter,pageCount:99,expectedMeasures:{pageCount:24,readingMinutes:3}}})).status(),409);
 assert.equal((await q('SELECT page_count FROM chapters WHERE id=$1',[chapterIds[0]])).rows[0].page_count,25);
 // Restore only the synthetic fixture's exact page count for the existing progress assertions below.
 await q('UPDATE chapters SET page_count=24 WHERE id=$1',[chapterIds[0]]);
 await page.getByRole('button',{name:'+ Добавить главы',exact:true}).click();
 const add=page.getByRole('dialog',{name:'Добавить главы',exact:true});
 await add.getByLabel('Название главы',{exact:true}).fill('Pages creation QA');
 await add.getByLabel('Количество страниц (необязательно)',{exact:true}).fill('12');
 await add.getByLabel('Примерное время чтения, мин (необязательно)',{exact:true}).fill('2');
 await page.setViewportSize({width:390,height:1000});
 await add.getByLabel('Количество страниц (необязательно)',{exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:resolve(out,'admin-create-pages-390.png')});result.screenshots.push('admin-create-pages-390.png');
 await add.getByRole('button',{name:'Проверить главы',exact:true}).click();
 await add.getByRole('button',{name:'Сохранить главу',exact:true}).click();await add.waitFor({state:'hidden'});
 const created=(await q("SELECT id,page_count,reading_minutes FROM chapters WHERE comic_id=$1 AND title='Pages creation QA'",[book])).rows[0];
 assert.equal(created.page_count,12);assert.equal(created.reading_minutes,2);
 await q('DELETE FROM chapters WHERE id=$1 AND comic_id=$2',[created.id,book]);
 result.checks.push('REAL_CHAPTER_CREATE_EDIT_OPTIONAL_PAGES_MINUTES=PASS');
 await q('UPDATE chapters SET title=title || $1 WHERE id=$2',[' — очень длинное название главы о путешествии через далёкую долину и возвращении домой',chapterIds[0]]);
 const known=(await q("SELECT id FROM chapters WHERE comic_id=$1 AND volume_number=2",[book])).rows[0].id;await q('UPDATE chapters SET page_count=10 WHERE id=$1',[known]);await q("INSERT INTO chapters(comic_id,display_code,sort_order,status,volume_number) VALUES($1,'Не заполнена',10,'RELEASED',2)",[book]);
 assert.equal((await ac.request.put(endpoint,{headers:{origin},data:{revision:0,ageRating:null,genres:[],chapters:[]}})).status(),409);result.checks.push('REAL_ADMIN_EDITOR_SAVE_AND_HTTP_STALE_REVISION=PASS');
 for(const theme of ['tea','paper','night'])for(const width of [320,390,1440]){
  const c=await context(user.token,theme,width),p=await c.newPage();await p.goto(origin+'/comics/'+slug,{waitUntil:'networkidle'});
  assert.equal(await p.locator('.wd-title-flourish').count(),0);assert.equal(await p.locator('[data-open-discussion]').count(),0);assert.equal(await p.locator('.wd-age-rating').textContent(),'12+');assert.equal(await p.locator('.wd-genre-tags li').count(),3);
  const volume=p.locator('.wd-volume').filter({hasText:'Храбрый маленький король'}).first();assert.match(await volume.locator('summary').textContent(),/130 стр/);assert.match(await volume.locator('summary').textContent(),/15 мин/);assert.match(await volume.locator('summary').textContent(),/20%/);assert.match(await volume.locator('summary').textContent(),/Страницы прочитанных глав: 24 из 130/);assert.equal(await volume.locator('summary progress').count(),1);assert.match(await volume.locator('summary').textContent(),/По оценкам глав/);
  if(await volume.getAttribute('open')===null)await volume.locator('summary').click();
  const first=p.locator('.wd08-row').filter({hasText:'Короли настоящего и будущего'});assert.match(await first.locator('.wd08-pages').textContent(),/24/);assert.match(await first.locator('.wd-score').textContent(),/Моя оценка.*4/);
  const incomplete=p.locator('.wd-volume').nth(1);assert.match(await incomplete.locator('.wd-volume-incomplete').textContent(),/1 из 2/);assert.equal(await incomplete.getByRole('progressbar',{name:/Страницы прочитанных глав/}).count(),0);
  for(const img of await p.locator('.wd08-row:visible .wd08-cover-art img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(async el=>{await el.decode();if(!el.complete||el.naturalWidth===0)throw Error('fixture illustration not loaded');});}
  if(width===1440){const art=await p.locator('.wd08-row:visible .wd08-cover-art').first().evaluate(el=>{const a=el.getBoundingClientRect(),r=el.closest('.wd08-row').getBoundingClientRect();return {center:(a.left+a.width/2-r.left)/r.width,opacity:Number(getComputedStyle(el).opacity)};});assert.ok(Math.abs(art.center-.5)<.05);assert.ok(art.opacity<=.3);}
  await p.evaluate(()=>scrollTo(0,0));
  const chapterShot=`${theme}-${width}-chapters.png`;await p.screenshot({path:resolve(out,chapterShot),fullPage:true});result.screenshots.push(chapterShot);
  await p.getByRole('tab',{name:'Отзывы и комментарии',exact:true}).click();await p.locator('.reader-rating-personal strong').filter({hasText:'4,2'}).waitFor();assert.equal(await p.locator('.reader-rating-criteria svg').count(),5);
  await p.getByRole('button',{name:'Редактировать мою оценку',exact:true}).click();await p.getByRole('dialog',{name:'Редактировать отзыв',exact:true}).waitFor();await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const shot=`${theme}-${width}-ratings.png`;await p.screenshot({path:resolve(out,shot),fullPage:true});result.screenshots.push(shot);
  result.checks.push(`${theme}_${width}=PASS`);await c.close();
 }
 const blank=await context(null,'paper',390),bp=await blank.newPage();await bp.goto(origin+'/comics/'+emptySlug+'#reviews',{waitUntil:'networkidle'});assert.equal(await bp.locator('[data-community-overall]').textContent(),'—');assert.deepEqual(await bp.locator('.reader-rating-criteria dd').allTextContents(),Array(5).fill('—'));await bp.screenshot({path:resolve(out,'empty-ratings.png'),fullPage:true});result.screenshots.push('empty-ratings.png');result.checks.push('EMPTY_DASHES_NO_FABRICATED_VALUES=PASS');
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);result.status='PASS';console.log(result.checks.join('\n'));
}catch(e){result.status='BLOCKED';result.error=e.message;throw e;}
finally{await writeFile(resolve(out,'RESULTS.json'),JSON.stringify(result,null,2)+'\n');await browser.close();await q('DELETE FROM user_chapter_reads WHERE user_id=ANY($1::int[])',[users]);await q('DELETE FROM administrative_audit_events WHERE actor_user_id=ANY($1::int[])',[users]);await q('DELETE FROM comics WHERE id=ANY($1::int[])',[books]);await q('DELETE FROM users WHERE id=ANY($1::int[])',[users]);if(category)await q('DELETE FROM categories WHERE id=$1',[category]);await pool.end();}
