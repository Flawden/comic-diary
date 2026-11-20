import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const file = new URL('../src/modules/auth/password-reset-request-resend-outcome-bridge.ts', import.meta.url);
const src = readFileSync(file, 'utf8');
test('bridge is inert and does not call provider, DB or worker', () => {
  assert.match(src, /export function bridgeRecoveryResendOutcome/);
  assert.doesNotMatch(src, /\b(fetch|db\.transaction|db\.select|setTimeout|process\.env)\s*\(/);
  assert.doesNotMatch(src, /\bfrom\s+["'](?:@\/db|node:http|node:https)/);
});
test('only exact four-field result shape is accepted', () => {
  assert.match(src, /keys\.length !== 4/);
  assert.match(src, /attempted\|classification\|retryAuthorized\|sendAuthorized/);
  assert.match(src, /r\.sendAuthorized !== false \|\| r\.retryAuthorized !== false/);
});
test('blocked is never eligible and all outcomes prohibit send/retry', () => {
  assert.match(src, /eligible: false; sendAuthorized: false; retryAuthorized: false/);
  assert.match(src, /r\.attempted === false && r\.classification === "blocked"/);
  assert.match(src, /r\.classification === "accepted"/);
  assert.match(src, /r\.classification === "rejected"/);
  assert.match(src, /r\.classification === "uncertain"/);
});
