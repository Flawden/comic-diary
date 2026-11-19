/** Claim-only runtime API. No database or provider calls in this contract. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const claim = readFileSync('src/modules/auth/password-reset-request-outbox-claim.ts', 'utf8');
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

test('recovery claim runtime exports only claiming, never legacy settlement', () => {
  assert.doesNotMatch(claim, /finalizeClaimedPasswordResetMail/);
  assert.deepEqual([...claim.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map(m => m[1]), ['claimPendingPasswordResetMailOnce']);
  assert.doesNotMatch(claim, /state:\s*input\.result|kind:\s*"provider_result"/);
});
test('claim, fence and reservation probes cannot assert successful legacy calls', () => {
  for (const path of ['scripts/auth-r1c2b2-recovery-claim-pg-probe.ts', 'scripts/auth-r1c2c2-recovery-fence-pg-probe.ts', 'scripts/auth-r1c2c3-recovery-reserve-pg-probe.ts']) {
    const probe = readFileSync(path, 'utf8');
    assert.match(probe, /Reflect\.get\(claimer, "finalizeClaimedPasswordResetMail"\), undefined/);
    assert.doesNotMatch(probe, /claimer\.finalizeClaimedPasswordResetMail\s*\(/);
    assert.ok(workflow.includes(`run: node --import tsx ${path}`));
  }
});
test('CI runs the claim export contract and behavioral PostgreSQL suite', () => {
  for (const path of ['scripts/auth-r1c2b2-recovery-claim-contract.test.mjs', 'scripts/auth-r1c2c2-recovery-fence-contract.test.mjs', 'scripts/auth-r1c2c3-recovery-reserve-contract.test.mjs']) {
    assert.ok(workflow.includes(`node --test ${path}`));
  }
  assert.ok(workflow.includes('node --import tsx --test scripts/auth-dispatch-integration.test.ts'));
});
