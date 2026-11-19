/** R1C2C5: no production wiring, provider credential, or live mail in CI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';
const MODULE='password-reset-request-resend-test-adapter';
const path=`src/modules/auth/${MODULE}.ts`;
const source=readFileSync(path,'utf8');
function files(dir){
  if(!existsSync(dir)) return [];
  const results=[];
  for(const item of readdirSync(dir,{withFileTypes:true})){
    const name=join(dir,item.name);
    if(item.isDirectory()) results.push(...files(name));
    else if(item.isFile() && /\.(ts|tsx|mjs|js)$/.test(name)) results.push(name);
  }
  return results;
}
test('test adapter is isolated from all auth routes and other runtime modules',()=>{
  const locations=[...files('src/app/api/auth'),...files('src/modules/auth')]
    .map(p=>p.replaceAll('\\','/'))
    .filter(p=>p!==path && p!==`src/modules/auth/${MODULE}.test.ts`);
  const references=locations.filter(p=>readFileSync(p,'utf8').includes(MODULE));
  assert.deepEqual(references,[]);
});
test('adapter has no global fetch, env lookup, live worker or logger',()=>{
  assert.doesNotMatch(source,/\bprocess\.env\b|\bglobalThis\.fetch\b|\bfetch\s*\(|\bconsole\.|\bsetInterval\s*\(|\bsetTimeout\s*\(/);
  assert.match(source,/typeof input\.http !== "function"/);
  assert.match(source,/Idempotency-Key/);
});
test('default is blocked without explicit test permit and bound recipient',()=>{
  assert.match(source,/EXPLICIT_ONE_TEST_EMAIL/);
  assert.match(source,/input\.request\.payload\.to\[0\] !== input\.allowedTestRecipient/);
  assert.match(source,/retryAuthorized: false/);
});
