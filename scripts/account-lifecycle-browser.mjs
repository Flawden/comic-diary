import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Pool} from 'pg';
import {hash} from '@node-rs/argon2';
const target=new URL(process.env.LIFECYCLE_TEST_DATABASE_URL??'');
const local=target.hostname==='127.0.0.1'&&target.port==='55727'&&target.username==='lifecycle_qa'&&target.pathname==='/lifecycle_review';
const ci=process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='Flawden/comic-diary'&&target.hostname==='127.0.0.1'&&target.port==='5432'&&target.username==='comic_diary_ci'&&target.pathname==='/comic_diary_release';
if(target.protocol!=='postgresql:'||(!local&&!ci)||target.search||target.hash)throw Error('Refused non-disposable database');
const origin='http://127.0.0.1:3120',canonical='https://reader.example.invalid',out=resolve(process.env.LIFECYCLE_BROWSER_OUTPUT??'.qa/lifecycle-browser');
const {chromium}=createRequire(resolve(process.env.WD_BROWSER_ROOT??'../comic-diary-account-beta-controls/.qa/browser-deps','package.json'))('playwright-core');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.LIFECYCLE_BROWSER_EXECUTABLE?{executablePath:process.env.LIFECYCLE_BROWSER_EXECUTABLE}:{channel:'chrome'})});
const pool=new Pool({connectionString:target.href}),q=(s,v=[])=>pool.query(s,v),ids=[],contexts=[],prefix='lifecycle-browser-'+randomUUID(),password='Synthetic-password-123!',result={status:'PENDING',checks:[],screenshots:[],errors:[],external:[]};
const policy=(await q('SELECT * FROM site_access_policy WHERE id=1')).rows[0];
const controls=(await q('SELECT row_to_json(t) r FROM activation_mail_dispatch_control t UNION ALL SELECT row_to_json(t) FROM password_reset_mail_dispatch_control t')).rows;
async function actor(role='USER'){
 const id=(await q('INSERT INTO users(email,password_hash,display_name,role,email_verified_at) VALUES($1,$2,$3,$4,now()) RETURNING id',[prefix+'-'+randomUUID()+'@example.invalid',await hash(password),'Проверочный читатель с очень длинным именем',role])).rows[0].id;ids.push(id);
 const token=randomUUID()+randomUUID();await q("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[id,createHash('sha256').update(token).digest('hex')]);return{id,token};
}
async function context(who,theme='tea',width=1440){
 const c=await browser.newContext({viewport:{width,height:980}});contexts.push(c);
 await c.addCookies([{name:'comic-diary-theme',value:theme,url:origin},...(who?[{name:'comic_diary_session',value:who.token,url:origin}]:[])]);
 await c.route('**/*',async r=>{
  const req=r.request(),u=new URL(req.url());
  if(u.origin!==origin){if(req.resourceType()!=='image')result.external.push({origin:u.origin,type:req.resourceType()});return r.abort();}
  if(u.pathname.startsWith('/api/')){
   const headers={...(await req.allHeaders()),host:'reader.example.invalid','x-real-ip':'192.0.2.85'};
   if(!['GET','HEAD'].includes(req.method()))headers.origin=canonical;
   const res=await c.request.fetch(req.url(),{method:req.method(),headers,data:req.postDataBuffer(),maxRedirects:0});
   const rh=res.headers();if(rh['set-cookie']){assert.match(rh['set-cookie'],/;\s*secure/i);rh['set-cookie']=rh['set-cookie'].replace(/;\s*secure/gi,'');}
   return r.fulfill({response:res,headers:rh});
  }return r.continue();
 });c.on('page',p=>p.on('pageerror',e=>result.errors.push({url:p.url(),message:e.message})));return c;
}
async function post(c,path,data,originHeader=canonical){return c.request.post(origin+path,{headers:{host:'reader.example.invalid',origin:originHeader},data});}
try{
 await q('UPDATE site_access_policy SET beta_only=false WHERE id=1');
 const admin=await actor('ADMIN'),editor=await actor('EDITOR'),user=await actor(),victim=await actor();
 const ca=await context(admin),cu=await context(user),ce=await context(editor),guest=await context();
 const endpoint=`/api/admin/users/${victim.id}/lifecycle`;
 assert.equal((await post(guest,endpoint,{action:'BAN',confirm:`BAN:${victim.id}`})).status(),401);
 for(const c of [cu,ce])assert.equal((await post(c,endpoint,{action:'DELETE',confirm:`DELETE:${victim.id}`})).status(),403);
 assert.equal((await post(ca,endpoint,{action:'BAN',confirm:`BAN:${victim.id}`},'https://evil.example.invalid')).status(),403);
 assert.equal((await post(ca,endpoint,{action:'DELETE',confirm:'wrong'})).status(),400);
 assert.equal((await post(cu,'/api/account/delete',{password,confirm:'wrong'})).status(),400);
 assert.equal((await post(cu,'/api/account/delete',{password:'wrong',confirm:'УДАЛИТЬ'})).status(),401);
 result.checks.push('Guest/USER/EDITOR, foreign Origin, confirmation and password rejected');
 const p=await ca.newPage();await p.goto(origin+'/admin/users',{waitUntil:'domcontentloaded'});
 const card=p.locator('article').filter({hasText:`ID ${victim.id} ·`});await card.getByRole('button',{name:'Заблокировать',exact:true}).waitFor();
 p.on('dialog',d=>d.accept());
 await card.getByRole('button',{name:'Заблокировать',exact:true}).click();await card.getByRole('button',{name:'Разблокировать',exact:true}).waitFor();
 assert.equal((await q('SELECT count(*)::int n FROM sessions WHERE user_id=$1',[victim.id])).rows[0].n,0);
 await card.getByRole('button',{name:'Разблокировать',exact:true}).click();await card.getByRole('button',{name:'Заблокировать',exact:true}).waitFor();
 await card.getByRole('button',{name:'Удалить пользователя…',exact:true}).click();await card.getByLabel('Подтверждение ID').fill(String(victim.id));await card.getByRole('button',{name:'Удалить навсегда',exact:true}).click();await card.waitFor({state:'detached'});
 result.checks.push('Actual ADMIN UI ban, unban, typed-ID permanent delete');
 for(const [theme,width] of [['tea',1440],['paper',390],['night',320]]){
  const who=await actor(),c=await context(who,theme,width),page=await c.newPage();
  await q('UPDATE site_access_policy SET beta_only=true WHERE id=1');
  await page.goto(origin+'/account/delete',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Удалить мой аккаунт',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const shot=theme+'-'+width+'-delete.png';await page.screenshot({path:resolve(out,shot),fullPage:true});result.screenshots.push(shot);
  await page.getByLabel('Текущий пароль').fill(password);await page.getByLabel('Для подтверждения напишите УДАЛИТЬ').fill('УДАЛИТЬ');
  await page.getByRole('button',{name:'Удалить аккаунт навсегда',exact:true}).click();await page.waitForURL('**/login?account=deleted');await page.getByRole('status').filter({hasText:'Аккаунт удалён'}).waitFor();
  assert.equal((await q('SELECT password_hash,is_active,deleted_at FROM users WHERE id=$1',[who.id])).rows[0].password_hash,null);
  assert.equal((await q('SELECT count(*)::int n FROM sessions WHERE user_id=$1',[who.id])).rows[0].n,0);
  await q('UPDATE site_access_policy SET beta_only=false WHERE id=1');
 }
 result.checks.push('Self deletion remains accessible outside beta, actual password form, logout and confirmation in Tea/Paper/Night 320/390/1440');
 assert.deepEqual((await q('SELECT row_to_json(t) r FROM activation_mail_dispatch_control t UNION ALL SELECT row_to_json(t) FROM password_reset_mail_dispatch_control t')).rows,controls);
 assert.deepEqual(result.external,[]);assert.deepEqual(result.errors,[]);result.status='PASS';
}catch(e){result.status='FAIL';result.failure=String(e);throw e;}
finally{
 await writeFile(resolve(out,'RESULTS.json'),JSON.stringify(result,null,2));
 for(const c of contexts)await c.close();await browser.close();
 await q('UPDATE site_access_policy SET beta_only=$1 WHERE id=1',[policy.beta_only]);
 await q('DELETE FROM account_lifecycle_events WHERE actor_user_id=ANY($1::int[]) OR target_user_id=ANY($1::int[])',[ids]);
 await q('DELETE FROM administrative_audit_events WHERE actor_user_id=ANY($1::int[])',[ids]);
 await q('DELETE FROM users WHERE id=ANY($1::int[])',[ids]);await pool.end();
 console.log(JSON.stringify(result));
}
