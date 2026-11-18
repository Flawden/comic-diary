import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const path = 'src/modules/auth/password-reset-request-resend-runtime-config.ts';
const code = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const operatorNotes = readFileSync(new URL('./auth-r1c2c6-resend-operator-notes.md', import.meta.url), 'utf8');

test('configuration module cannot send mail or access ambient secrets', () => {
  const executable = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(executable, /\b(?:fetch|sendMail|createTransport|setTimeout|setInterval|process\.env|console\.|writeFile|execSync|spawn)\b/);
  assert.match(code, /AUTH_RECOVERY_RESEND_CONFIG_READY/);
  assert.match(code, /RESEND_API_KEY/);
  assert.match(code, /return null/);
});
test('operator note explicitly forbids GitHub Actions and publishing keys', () => {
  assert.match(operatorNotes, /SERVER ONLY/);
  assert.match(operatorNotes, /GitHub Actions/);
  assert.match(operatorNotes, /never commit/i);
  assert.match(operatorNotes, /not a send permit/i);
  assert.doesNotMatch(operatorNotes, /re_[A-Za-z0-9_-]{8,}/);
});
