/**
 * AUTH-01C2B4D2C4B3B3A — OFFLINE CONTROL-PLANE SAFETY SPECIFICATION.
 * NOT a runtime operator switch, network authorizer, mail worker, SQL migration,
 * process monitor, or delivery adapter. This synthetic model does NO IO.
 *
 * Future rule: a shared persisted operator gate must be locked/rechecked in
 * the SAME serialized transaction as any final transport-attempt reservation.
 * Gate -> USER -> TOKEN -> OUTBOX is the proposed consistent lock order.
 * A committed disable/revoke BEFORE reservation must block a NEW reservation.
 * Neither reservation nor B3B2 fence can atomically guarantee that an HTTP
 * request cannot START after a LATER disable/revoke (non-guarantee B).
 *
 * The actual B3B2 fence returns sendAuthorized:false. This spec does too.
 * It is intentionally NOT a substitute for future disposable PostgreSQL tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const fence = read('src/modules/auth/registration-activation-outbox-fence.ts');
const claim = read('src/modules/auth/registration-activation-outbox-claim.ts');
const policy = read('src/modules/auth/registration-activation-outbox-policy.ts');
const resend = read('src/modules/auth/registration-activation-resend-contract.ts');
const dryRun = read('src/modules/auth/registration-activation-outbox-dry-run.ts');
const migration0036 = read('drizzle/0036_auth_activation_dispatch_fence.sql');
const workflow = read('.github/workflows/ci.yml');

function initial(partial = {}) {
  return Object.freeze({
    // gateEpoch models a future monotonic persisted generation, not actual DB.
    gateEnabled: false, gateEpoch: 0, tokenLive: true, emailMatches: true,
    keyAvailable: true, originMatches: true, claimMatches: true,
    tokenMatches: true, expiryValid: true, fenceRecorded: true,
    outbox: 'in_flight', reserved: false, reserveEpoch: null,
    hypotheticalProviderStarts: 0, terminal: null,
    autoRetry: false, inboxDelivered: false, sendAuthorized: false,
    ...partial,
  });
}
function step(before, kind, options = {}) {
  const s = { ...before };
  switch (kind) {
    case 'enable': s.gateEnabled = true; s.gateEpoch++; break;
    case 'disable': s.gateEnabled = false; s.gateEpoch++; break;
    case 'revoke': case 'consume': s.tokenLive = false; break;
    case 'email-change': s.emailMatches = false; break;
    case 'key-loss': s.keyAvailable = false; break;
    case 'origin-change': s.originMatches = false; break;
    case 'claim-loss': s.claimMatches = false; break;
    case 'token-swap': s.tokenMatches = false; break;
    case 'expiry': s.expiryValid = false; break;
    case 'fence-missing': s.fenceRecorded = false; break;
    case 'reserve': {
      // Future one-transaction gate -> USER -> TOKEN -> OUTBOX recheck.
      // A cached epoch by itself is NEVER an authorization.
      const allowed = s.gateEnabled && s.tokenLive && s.emailMatches &&
        s.keyAvailable && s.originMatches && s.claimMatches && s.tokenMatches &&
        s.expiryValid && s.fenceRecorded && s.outbox === 'in_flight' &&
        !s.reserved && (options.expectedEpoch === undefined || options.expectedEpoch === s.gateEpoch);
      if (allowed) { s.reserved = true; s.reserveEpoch = s.gateEpoch; }
      break;
    }
    case 'hypothetical-network-start':
      // Counterexample only: this does NOT perform or authorize any IO.
      if (s.reserved && s.hypotheticalProviderStarts === 0 && !s.terminal) s.hypotheticalProviderStarts++;
      break;
    case 'provider-accepted': case 'provider-rejected':
      if (s.reserved && !s.terminal && s.outbox === 'in_flight') {
        s.terminal = kind === 'provider-accepted' ? 'accepted' : 'rejected';
        s.outbox = s.terminal;
      }
      break;
    case 'timeout': case 'lost-response': case 'transport-error': case 'http-409':
    case 'http-429': case 'http-500':
      if (s.reserved && !s.terminal && s.outbox === 'in_flight') {
        s.terminal = 'uncertain'; s.outbox = 'uncertain';
      }
      break;
    case 'crash':
      // Crash cannot atomically write a terminal state; manual reconciliation.
      break;
    case 'manual-reconcile-uncertain':
      if (s.outbox === 'in_flight' && options.provenStale === true &&
          options.explicitOperatorReview === true) {
        s.outbox = 'uncertain'; s.terminal = 'uncertain';
      }
      break;
    default: throw new Error('unknown synthetic transition');
  }
  // All outcomes deliberately retain these safety properties.
  return Object.freeze(s);
}
const run = (events, state = initial()) => events.reduce((s, e) => step(s, e), state);
function permutations(xs) {
  return xs.length ? xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>i!==j)).map((tail)=>[x,...tail])) : [[]];
}

// Ground the spec in the exact B3B2 implementation, not aspirational claims.
test('B3B2 fence remains an inert internal DB marker, never send authorization', () => {
  assert.match(fence, /INTERNAL DATABASE FENCE ONLY/);
  assert.match(fence, /sendAuthorized: false/);
  assert.doesNotMatch(fence, /sendAuthorized: true|\bfetch\s*\(|\bsendEmail\s*\(/);
});
test('current per-call operatorFenceEnabled is not a shared DB kill switch', () => {
  assert.match(fence, /operatorFenceEnabled !== true/);
  assert.match(fence, /It is not a remotely[\s\S]*operator kill switch/);
});
test('B3B2 already locks USER then TOKEN then OUTBOX for the fence', () => {
  const locked=fence.slice(fence.indexOf('return db.transaction'));
  const p=[locked.indexOf('.from(users)'),locked.indexOf('.from(emailVerificationTokens)'),locked.indexOf('.from(activationMailOutbox)')];
  assert.ok(p.every(x=>x>=0) && p[0]<p[1] && p[1]<p[2]);
  assert.equal((locked.match(/\.for\("update"\)/g)??[]).length,3);
});
test('B3B2 migration records fence but contains no global gate table', () => {
  assert.match(migration0036, /dispatch_fence_at/);
  assert.doesNotMatch(migration0036, /operator_gate|control_plane|dispatch_enabled/);
});
test('existing finalizer accepts terminal classification without fence (compatibility gap)', () => {
  assert.match(claim, /export async function finalizeClaimedActivationMail/);
  const finalize=claim.slice(claim.indexOf('export async function finalizeClaimedActivationMail'));
  assert.doesNotMatch(finalize,/dispatchFenceAt|dispatch_fence_at/);
  assert.match(finalize,/state: input\.result, finalizedAt: now/);
});
test('existing classifier treats ambiguity conservatively, not as safe retry', () => {
  assert.match(resend,/status === 409|status === 200/);
  assert.match(resend,/status === 400/);
  assert.match(resend,/return "uncertain";/);
});
test('existing policy forbids terminal-to-ready and marks transport error uncertain', () => {
  assert.match(policy,/current !== "ready" && current !== "in_flight"/);
  assert.match(policy,/return "uncertain";/);
  assert.doesNotMatch(policy,/automaticallyRetry\s*=\s*true/);
});
test('dry-run snapshot remains no-send and cannot replace an atomic gate', () => {
  assert.match(dryRun,/sendAuthorized: false/);
  assert.match(dryRun,/dispatcher must solve the atomic last-mile/);
});
test('CI adds B3B3A only as an offline no-delivery step and retains PG probes', () => {
  for(const x of [
    'AUTH-01C2B4D2C4B3B3A offline operator gate and uncertain-outcome semantics (NO delivery)',
    'node --test scripts/auth-registration-c2b4d2c4b3b3a-control-spec.test.mjs',
    'AUTH-01C2B4D2C4B3B2 disposable PostgreSQL fence concurrency (NO delivery)',
    'run: npm run lint','run: npm run typecheck',
    "if: github.event_name == 'push' && github.ref == 'refs/heads/master'",
  ]) assert.ok(workflow.includes(x),x);
});

test('default-off shared gate prevents new reservation', () => {
  const s=run(['reserve']);assert.equal(s.reserved,false);assert.equal(s.sendAuthorized,false);
});
test('operator disable committed BEFORE reserve blocks it', () => {
  assert.equal(run(['enable','disable','reserve']).reserved,false);
});
test('re-enable has a new monotonic epoch, never accepts cached old epoch', () => {
  const s=run(['enable','disable','enable']);
  assert.equal(s.gateEpoch,3);
  assert.equal(step(s,'reserve',{expectedEpoch:1}).reserved,false);
  assert.equal(step(s,'reserve',{expectedEpoch:3}).reserved,true);
});
test('operator epoch is not enough without current row-lock recheck', () => {
  const s=run(['enable','disable']);
  assert.equal(step(s,'reserve',{expectedEpoch:2}).reserved,false);
});
test('revoke BEFORE reservation always blocks new reservation', () => {
  assert.equal(run(['enable','revoke','reserve']).reserved,false);
});
test('consume BEFORE reservation always blocks new reservation', () => {
  assert.equal(run(['enable','consume','reserve']).reserved,false);
});
test('revoke or consume persists across enable/disable changes', () => {
  for (const k of ['revoke','consume']) assert.equal(run(['enable',k,'disable','enable','reserve']).reserved,false);
});
test('mismatched claim never gets reservation', () => {
  assert.equal(run(['enable','claim-loss','reserve']).reserved,false);
});
test('mismatched token never gets reservation', () => {
  assert.equal(run(['enable','token-swap','reserve']).reserved,false);
});
test('changed recipient never gets reservation', () => {
  assert.equal(run(['enable','email-change','reserve']).reserved,false);
});
test('missing AEAD key prevents reservation', () => {
  assert.equal(run(['enable','key-loss','reserve']).reserved,false);
});
test('untrusted origin prevents reservation', () => {
  assert.equal(run(['enable','origin-change','reserve']).reserved,false);
});
test('expired token prevents reservation', () => {
  assert.equal(run(['enable','expiry','reserve']).reserved,false);
});
test('missing prior durable fence prevents reservation', () => {
  assert.equal(run(['enable','fence-missing','reserve']).reserved,false);
});
test('terminal and unclaimed rows never reserve a new attempt', () => {
  for (const outbox of ['ready','expired','accepted','rejected','uncertain']) {
    assert.equal(run(['enable','reserve'],initial({outbox})).reserved,false,outbox);
  }
});
test('two competing workers can record only one reservation in model', () => {
  const s=run(['enable','reserve','reserve','reserve']);
  assert.equal(s.reserved,true);assert.equal(s.reserveEpoch,1);
});
test('disable BEFORE reserve blocks all orderings of unrelated invalidations', () => {
  for (const order of permutations(['disable','email-change','claim-loss'])) {
    const s=run(['enable',...order,'reserve']);assert.equal(s.reserved,false,order.join(','));
  }
});
test('disable AFTER reservation cannot guarantee cancellation of an HTTP start', () => {
  const s=run(['enable','reserve','disable','hypothetical-network-start']);
  assert.equal(s.hypotheticalProviderStarts,1);
  assert.equal(s.sendAuthorized,false); // illustrative counterexample only.
});
test('revoke AFTER reservation likewise cannot guarantee HTTP-start suppression', () => {
  const s=run(['enable','reserve','revoke','hypothetical-network-start']);
  assert.equal(s.hypotheticalProviderStarts,1);
  assert.equal(s.sendAuthorized,false);
});
test('accepted is strictly provider acknowledgment, not inbox delivery', () => {
  const s=run(['enable','reserve','hypothetical-network-start','provider-accepted']);
  assert.equal(s.terminal,'accepted');assert.equal(s.inboxDelivered,false);
});
test('explicit rejected result is terminal and never retryable', () => {
  const s=run(['enable','reserve','provider-rejected','reserve']);
  assert.equal(s.terminal,'rejected');assert.equal(s.autoRetry,false);
});
test('network errors/timeouts/conflicts/5xx collapse to terminal uncertain', () => {
  for (const bad of ['timeout','lost-response','transport-error','http-409','http-429','http-500']) {
    const s=run(['enable','reserve',bad]);
    assert.equal(s.terminal,'uncertain',bad);assert.equal(s.autoRetry,false,bad);
  }
});
test('crash before reservation is NOT evidence of no external contact or retry permission', () => {
  const s=run(['enable','crash']);
  assert.equal(s.terminal,null);assert.equal(s.reserved,false);assert.equal(s.autoRetry,false);
});
test('crash after reservation persists ambiguous in_flight until reconciliation', () => {
  const s=run(['enable','reserve','crash']);
  assert.equal(s.outbox,'in_flight');assert.equal(s.terminal,null);assert.equal(s.autoRetry,false);
});
test('manual reconciliation demands both proven staleness AND explicit review', () => {
  const s=run(['enable','reserve','crash']);
  assert.equal(step(s,'manual-reconcile-uncertain',{provenStale:true}).terminal,null);
  assert.equal(step(s,'manual-reconcile-uncertain',{explicitOperatorReview:true}).terminal,null);
  assert.equal(step(s,'manual-reconcile-uncertain',{provenStale:true,explicitOperatorReview:true}).terminal,'uncertain');
});
test('uncertain cannot transition to ready, accepted or another provider attempt', () => {
  const s=run(['enable','reserve','timeout','reserve','provider-accepted','hypothetical-network-start']);
  assert.equal(s.terminal,'uncertain');assert.equal(s.outbox,'uncertain');
  assert.equal(s.hypotheticalProviderStarts,0);assert.equal(s.autoRetry,false);
});
test('provider result without prior reservation must not be persisted by future path', () => {
  for (const k of ['provider-accepted','provider-rejected','timeout','transport-error']) {
    const s=run([k]);assert.equal(s.terminal,null,k);
  }
});
test('all scenario permutations keep actual send authorization false and no auto retry', () => {
  for (const order of permutations(['enable','reserve','disable','revoke','hypothetical-network-start'])) {
    const s=run(order);assert.equal(s.sendAuthorized,false,order.join(','));
    assert.equal(s.autoRetry,false,order.join(','));assert.equal(s.inboxDelivered,false);
  }
});
