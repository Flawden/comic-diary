/** D2C3 inert atomic issue structural regressions. No DB/network/keys. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const issue=read('src/modules/auth/registration-activation-outbox-issue.ts');
const ci=read('.github/workflows/ci.yml');
const schema=read('drizzle/0035_auth_activation_mail_outbox.sql');
const tokens=read('src/modules/auth/email-verification-service.ts');

test('D2C3 uses one transaction with account lock, revocation and encrypted enqueue',()=>{
 assert.match(issue,/db\.transaction\(tx => enqueuePendingActivationMailInTransaction\(tx, input\)\)/);
 assert.match(issue,/\.from\(users\)[\s\S]*?\.for\("update"\)/);
 assert.match(issue,/needsSecurePendingActivation\(account\)/);
 assert.match(issue,/canIssueEmailVerification\(account\)/);
 assert.match(issue,/\.update\(emailVerificationTokens\)[\s\S]*?\.set\(\{ revokedAt: now \}\)/);
 assert.match(issue,/\.update\(activationMailOutbox\)[\s\S]*?state: "expired"/);
 assert.match(issue,/\.insert\(emailVerificationTokens\)/);
 assert.match(issue,/sealActivationMailOutboxPayload\(/);
 assert.match(issue,/\.insert\(activationMailOutbox\)/);
 assert.ok(issue.indexOf('.for("update")') < issue.indexOf('.update(emailVerificationTokens)'));
 assert.ok(issue.indexOf('.update(emailVerificationTokens)') < issue.indexOf('.insert(emailVerificationTokens)'));
 assert.ok(issue.indexOf('.insert(emailVerificationTokens)') < issue.indexOf('.insert(activationMailOutbox)'));
 assert.match(issue,/if \(!envelope\) throw new Error/);
});

test('D2C3 fails closed, does not leak raw token or persist mailbox plaintext',()=>{
 assert.match(issue,/canonicalActivationMailOrigin\(input\.publicOrigin\)/);
 assert.match(issue,/tokenHash: issued\.tokenHash/);
 assert.match(issue,/emailSnapshot: account\.email/);
 assert.match(issue,/payloadCiphertext: envelope\.payloadCiphertext/);
 assert.match(issue,/randomBytes\(24\)\.toString\("base64url"\)/);
 assert.doesNotMatch(issue,/process\.env|console\.|fetch\(|\.send\(|deliverPendingActivationMail|route\.ts|setCookie|cookies\(/);
 assert.doesNotMatch(issue,/return\s*\{[^}]*\btoken\b/);
 assert.doesNotMatch(issue,/\.set\(\{[^}]*?tokenHash:/);
});

test('D2C3 is additive: no replacement of historical internal issue service or outbox migration',()=>{
 assert.match(tokens,/export async function issueEmailVerificationForUser\(/);
 assert.match(schema,/CREATE TABLE "activation_mail_outbox"/);
 assert.match(schema,/"verification_token_id" integer NOT NULL/);
 assert.match(schema,/"idempotency_key" varchar\(64\) NOT NULL/);
 assert.match(schema,/"payload_ciphertext" text NOT NULL/);
 assert.match(schema,/"state" varchar\(16\) DEFAULT 'ready' NOT NULL/);
});

test('CI verifies D2C3 structural and disposable PostgreSQL race/rollback tests',()=>{
 assert.match(ci,/AUTH-01C2B4D2C3 atomic encrypted enqueue contract/);
 assert.match(ci,/node --test scripts\/auth-registration-c2b4d2c3-contract\.test\.mjs/);
 assert.match(ci,/AUTH-01C2B4D2C3 disposable PostgreSQL atomic enqueue and rollback/);
 assert.match(ci,/node --import tsx scripts\/auth-registration-c2b4d2c3-pg-probe\.ts/);
});
