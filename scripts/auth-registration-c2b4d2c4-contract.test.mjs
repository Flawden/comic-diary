/** AUTH-01C2B4D2C4A: inert claim/finalize structural boundary. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const svc = readFileSync('src/modules/auth/registration-activation-outbox-claim.ts','utf8');
const workflow = readFileSync('.github/workflows/ci.yml','utf8');
const schema = readFileSync('drizzle/0035_auth_activation_mail_outbox.sql','utf8');
const previousIssue = readFileSync('src/modules/auth/registration-activation-outbox-issue.ts','utf8');

test('D2C4 is an internal claim/finalize API with no transport, secrets, or routes', () => {
  assert.match(svc, /export async function claimPendingActivationMailOnce\(/);
  assert.match(svc, /export async function finalizeClaimedActivationMail\(/);
  assert.doesNotMatch(svc, /\bfetch\s*\(|\bprocess\.env\b|\bresend\b|\bSMTP\b|createCipheriv|createDecipheriv/i);
  assert.doesNotMatch(svc, /console\.|\blogger\.|\bsendEmail\s*\(/);
  assert.ok(!svc.includes('src/app/'));
});

test('D2C4 enforces the SAME user-token-outbox lock order as D2C3', () => {
  assert.match(svc, /from\(users\)[\s\S]*?\.for\("update"\)[\s\S]*?from\(emailVerificationTokens\)[\s\S]*?\.for\("update"\)[\s\S]*?from\(activationMailOutbox\)[\s\S]*?\.for\("update"\)/);
  assert.match(previousIssue,/Lock order: USER -> TOKEN update -> prior READY outbox update/);
  assert.match(svc,/canDispatchVerificationPurpose\(account, (?:purpose|token\.purpose)\)/);
  const purposePolicy = readFileSyncCompat();
  assert.match(purposePolicy,/purpose === "pending_activation".*needsSecurePendingActivation\(account\)/);
  assert.match(purposePolicy,/canIssueEmailVerification\(account\)/);
  assert.match(svc,/token\.consumedAt === null && token\.revokedAt === null/);
  assert.match(svc,/token\.emailSnapshot === account\.email/);
});

test('D2C4 only transitions ready to one claim or expired, never retries in-flight', () => {
  assert.match(svc,/eq\(activationMailOutbox\.state, "ready"\)/);
  assert.match(svc,/deriveActivationOutboxNextState\("ready"/);
  assert.match(svc,/attemptCount: 1/);
  assert.match(svc,/randomBytes\(24\)/);
  assert.match(svc,/state: "expired"/);
  assert.doesNotMatch(svc, /attemptCount:\s*2|state:\s*"ready"\s*,\s*claimId/);
});

test('D2C4 completion requires an existing claim and returns only terminal classifications', () => {
  assert.match(svc,/result: "accepted" \| "rejected" \| "uncertain"/);
  assert.match(svc,/item\.state !== "in_flight" \|\| item\.claimId !== input\.claimId/);
  assert.match(svc,/eq\(activationMailOutbox\.claimId, input\.claimId\)/);
  assert.match(svc,/deriveActivationOutboxNextState\("in_flight"/);
  assert.doesNotMatch(svc,/delivered|retry_after|requeue/i);
});

test('D2C4 matches immutable D2C1 state/attempt/check constraints', () => {
  for (const name of ['activation_mail_outbox_state_shape_check','attempt_count','claim_id','in_flight','uncertain']) {
    assert.ok(schema.includes(name), `missing ${name}`);
  }
  assert.match(schema,/"attempt_count" = 1 AND "claim_id" IS NOT NULL/);
});

test('CI exercises read-only contract and disposable PG claim concurrency, no real mail', () => {
  assert.match(workflow,/AUTH-01C2B4D2C4A internal claim and finalization contract \(no delivery\)/);
  assert.match(workflow,/node --test scripts\/auth-registration-c2b4d2c4-contract\.test\.mjs/);
  assert.match(workflow,/AUTH-01C2B4D2C4A disposable PostgreSQL claim and terminal states/);
  assert.match(workflow,/node --import tsx scripts\/auth-registration-c2b4d2c4-pg-probe\.ts/);
  assert.match(workflow,/if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/master'/);
});

function readFileSyncCompat() { return readFileSync('src/modules/auth/verification-purpose.ts','utf8'); }
