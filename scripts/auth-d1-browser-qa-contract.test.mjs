// Source-only guard for the D1 browser QA integration; real Chrome runs in disposable PostgreSQL CI.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const qa = readFileSync('scripts/auth-d1-browser-qa.mjs','utf8');
const ci = readFileSync('.github/workflows/ci.yml','utf8');

test('browser QA refuses non-disposable database or non-CI environment',()=>{
  for(const part of ['GITHUB_ACTIONS', 'DATABASE_URL !== expectedDb','comic_diary_release','D1_BROWSER_QA_REFUSED']) assert.ok(qa.includes(part));
});
test('redemption remains OFF for BOTH forms',()=>{
  assert.ok(qa.includes("REGISTRATION_ACTIVATION_REDEEM_ENABLED !== 'false'"));
  assert.ok(qa.includes("PASSWORD_RESET_REDEEM_ENABLED !== 'false'"));
  assert.match(ci,/REGISTRATION_ACTIVATION_REDEEM_ENABLED: "false"/);
  assert.match(ci,/PASSWORD_RESET_REDEEM_ENABLED: "false"/);
});
test('browser has localhost-only origin, no email or token fixture',()=>{
  assert.ok(qa.includes("http://127.0.0.1:3103"));
  assert.ok(qa.includes("target.origin === origin ? route.continue() : route.abort()"));
  assert.doesNotMatch(qa,/createSession|INSERT INTO|UPDATE users|DELETE FROM|sendMail|smtp|fetch\(['"]https?:/i);
});
test('browser covers auth pages at three themes and both viewports',()=>{
  for(const path of ['/login','/forgot-password','/reset-password','/activate']) assert.ok(qa.includes(`href: '${path}'`));
  for(const theme of ['tea','paper','night']) assert.ok(qa.includes(`'${theme}'`));
  assert.ok(qa.includes('width: 320'));assert.ok(qa.includes('width: 1440'));
});
test('asserts server OFF content, disabled controls and no fake email form',()=>{
  for(const needle of ["isDisabled()",'input[name="email"]', "Приём кодов восстановления", "Подтверждение пока недоступно", "POST_REQUESTS=0"]) assert.ok(qa.includes(needle.replaceAll('\\\\\\"','"')),needle);
});
test('fieldset QA checks native disabled state, not locator.isDisabled() on a fieldset',()=>{
  assert.ok(qa.includes("el.tagName === 'FIELDSET' && el.disabled === true && el.hasAttribute('disabled')"));
  assert.doesNotMatch(qa, /form\.locator\('fieldset'\)\.isDisabled\(\)/);
});
test('real link click navigation login / forgot / reset / login is covered',()=>{
  for(const needle of ["name: 'Забыли пароль?'","name: 'У меня уже есть код'","name: 'Вернуться ко входу'",'waitForURL']) assert.ok(qa.includes(needle));
});
test('browser results provide screenshots and sanitized manifest only',()=>{
  assert.ok(qa.includes('screenshot({ path: join(output, name)'));
  assert.ok(qa.includes("'manifest.json'"));
  assert.doesNotMatch(qa,/localStorage|sessionStorage|console\.log\(.*token|req\.postData/i);
});
test('CI runs real browser on disposable PostgreSQL and retains visual artifacts; deploy stays master-only',()=>{
  for(const part of ['AUTH-01 D1 isolated browser QA OFF-only (Chrome; NO mail)', 'node scripts/auth-d1-browser-qa.mjs', 'Upload AUTH-01 D1 browser QA screenshots','playwright-core@1.56.1',"if: github.event_name == 'push' && github.ref == 'refs/heads/master'"]) assert.ok(ci.includes(part));
});
