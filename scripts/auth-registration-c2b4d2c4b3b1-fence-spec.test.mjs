/**
 * AUTH-01C2B4D2C4B3B1 / OFFLINE SAFETY SPECIFICATION ONLY.
 * No production dispatch fence exists yet. No database, mail provider, HTTP,
 * scheduler, credentials, key material, or send permission is used or granted.
 *
 * CHOSEN FUTURE SEMANTIC A: a fence cannot be newly recorded after a completed
 * revoke/consume, under a single serialized account/token/outbox protocol.
 * NON-GUARANTEE B: recording a fence does NOT guarantee that an HTTP request
 * cannot start after a later revocation. These tests exhibit that counterexample.
 *
 * Models and static source assertions are NOT a substitute for future disposable
 * PostgreSQL concurrency tests of the actual B3B2 implementation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const claimSource = read("src/modules/auth/registration-activation-outbox-claim.ts");
const issueSource = read("src/modules/auth/registration-activation-outbox-issue.ts");
const activationSource = read("src/modules/auth/registration-activation-service.ts");
const drySource = read("src/modules/auth/registration-activation-outbox-dry-run.ts");
const schemaSource = read("drizzle/0035_auth_activation_mail_outbox.sql");
const b3aSource = read("scripts/auth-registration-c2b4d2c4b3a-race-contract.test.mjs");
const workflow = read(".github/workflows/ci.yml");

// Test-only abstract state transition system. NEVER import into application.
function initial(changes = {}) {
  return {
    state: "in_flight", claimId: "claim-A", actualClaimId: "claim-A",
    tokenId: 101, actualTokenId: 101, tokenLive: true, consumed: false,
    emailMatches: true, expiresValid: true, keyAvailable: true,
    originMatches: true, operatorEnabled: false, fenceCount: 0,
    fenceRecorded: false, providerStartCount: 0, terminal: null,
    autoRetry: false, inboxDelivered: false, realSendAuthorized: false,
    ...changes,
  };
}
function transition(current, event) {
  const s = { ...current };
  switch (event.type) {
    case "enable": s.operatorEnabled = true; break;
    case "disable": s.operatorEnabled = false; break;
    case "revoke": s.tokenLive = false; if (s.state === "ready") s.state = "expired"; break;
    case "consume": s.tokenLive = false; s.consumed = true; break;
    case "email-change": s.emailMatches = false; break;
    case "expire": s.expiresValid = false; break;
    case "key-unavailable": s.keyAvailable = false; break;
    case "origin-change": s.originMatches = false; break;
    case "claim-lost": s.actualClaimId = "different-claim"; break;
    case "wrong-token": s.actualTokenId = 102; break;
    case "fence": {
      // Abstract an atomic row-lock/recheck/write transaction. Not a DB call.
      const permitted = s.state === "in_flight" && s.fenceCount === 0 &&
        s.actualClaimId === s.claimId && s.actualTokenId === s.tokenId &&
        s.tokenLive && !s.consumed && s.emailMatches && s.expiresValid &&
        s.keyAvailable && s.originMatches && s.operatorEnabled;
      if (permitted) { s.fenceRecorded = true; s.fenceCount += 1; }
      break;
    }
    case "hypothetical-provider-start":
      // Counterexample ONLY. Not an HTTP operation or production authorization.
      if (s.fenceRecorded && s.terminal === null && s.providerStartCount === 0) {
        s.providerStartCount += 1;
      }
      break;
    case "accepted": s.terminal = s.providerStartCount ? "accepted" : null; break;
    case "rejected": s.terminal = s.providerStartCount ? "rejected" : null; break;
    case "timeout": s.terminal = s.fenceRecorded ? "uncertain" : null; break;
    case "crash": s.terminal = s.fenceRecorded ? "uncertain" : null; break;
    default: throw new Error("unsupported synthetic event");
  }
  return Object.freeze(s);
}
const event = (type) => ({ type });
const trace = (types, start = initial()) => types.reduce((s, type) => transition(s, event(type)), start);

function permutations(items) {
  if (items.length === 0) return [[]];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i+1)])
    .map((rest) => [x, ...rest]));
}

test("source: claim is a durable in_flight transition, not a network boundary", () => {
  assert.match(claimSource, /state: next, claimId, attemptCount: 1/);
  assert.match(claimSource, /This method DOES NOT authorize sending/);
  assert.doesNotMatch(claimSource, /\bfetch\s*\(|\bsendEmail\s*\(/);
});
test("source: issuer uses a USER lock before revoking tokens", () => {
  const lock = issueSource.indexOf('.from(users)');
  const revoke = issueSource.indexOf('.update(emailVerificationTokens)');
  assert.ok(lock >= 0 && revoke > lock);
  assert.match(issueSource, /eq\(activationMailOutbox\.state, "ready"\)/);
});
test("source: account consumption is protected, not a provider rollback", () => {
  assert.match(activationSource, /\.for\("update"\)/);
  assert.match(activationSource, /\.set\(\{ revokedAt: now \}\)/);
});
test("source: B1 preflight never grants send authorization", () => {
  assert.match(drySource, /sendAuthorized: false/);
  assert.doesNotMatch(drySource, /sendAuthorized: true/);
});
test("source: existing 0035 schema has no durable dispatch fence yet", () => {
  assert.match(schemaSource, /in_flight/);
  assert.doesNotMatch(schemaSource, /send_started_at|dispatch_fence_at|fence_epoch/i);
});
test("source: B3A retains its explicit stale-check counterexample", () => {
  assert.match(b3aSource, /revocation AFTER successful check exposes the unresolved last-mile gap/);
});
test("source: CI runs B3B1 offline without replacing B3A or disposable PostgreSQL", () => {
  assert.match(workflow, /AUTH-01C2B4D2C4B3B1 offline fence semantics \(NO delivery\)/);
  assert.match(workflow, /node --test scripts\/auth-registration-c2b4d2c4b3b1-fence-spec\.test\.mjs/);
  assert.match(workflow, /AUTH-01C2B4D2C4B3A offline revocation race contract \(NO delivery\)/);
  assert.match(workflow, /AUTH-01C2B4D2C4A disposable PostgreSQL claim and terminal states/);
  assert.match(workflow, /run: npm run lint/);
  assert.match(workflow, /run: npm run typecheck/);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/master'/);
});
test("fail closed: missing operator approval cannot record a fence", () => {
  const s = trace(["fence"]);
  assert.equal(s.fenceCount, 0);
  assert.equal(s.realSendAuthorized, false);
});
test("fail closed: explicit disabled operator blocks a fresh fence", () => {
  const s = trace(["enable", "disable", "fence"]);
  assert.equal(s.fenceCount, 0);
});
test("atomicity target A: revoke BEFORE fence blocks fence", () => {
  assert.equal(trace(["enable", "revoke", "fence"]).fenceCount, 0);
});
test("atomicity target A: consume BEFORE fence blocks fence", () => {
  assert.equal(trace(["enable", "consume", "fence"]).fenceCount, 0);
});
test("atomicity target A: completed revoke/consume cannot be bypassed by later enable", () => {
  for (const kind of ["revoke", "consume"]) {
    assert.equal(trace([kind, "enable", "fence"]).fenceCount, 0);
  }
});
test("fence is separate from claim and needs the exact claim ownership", () => {
  assert.equal(trace(["enable", "claim-lost", "fence"]).fenceCount, 0);
});
test("fence also binds the exact token identity", () => {
  assert.equal(trace(["enable", "wrong-token", "fence"]).fenceCount, 0);
});
test("changed mailbox blocks fence", () => {
  assert.equal(trace(["enable", "email-change", "fence"]).fenceCount, 0);
});
test("near-expired or invalid token lifetime blocks fence", () => {
  assert.equal(trace(["enable", "expire", "fence"]).fenceCount, 0);
});
test("key unavailable and mismatched origin each block fence", () => {
  for (const reason of ["key-unavailable", "origin-change"]) {
    assert.equal(trace(["enable", reason, "fence"]).fenceCount, 0);
  }
});
test("terminal or ready state does not allow a new fence", () => {
  for (const state of ["ready", "accepted", "rejected", "uncertain", "expired"]) {
    assert.equal(trace(["enable", "fence"], initial({ state })).fenceCount, 0);
  }
});
test("one claim never records two fences, even across two workers", () => {
  const s = trace(["enable", "fence", "fence", "fence"]);
  assert.equal(s.fenceCount, 1);
});
test("fence after revoke blocked for every ordering of unrelated events", () => {
  for (const order of permutations(["revoke", "email-change", "key-unavailable"])) {
    const s = trace(["enable", ...order, "fence"]);
    assert.equal(s.fenceCount, 0, order.join(","));
  }
});
test("fence before revoke fulfills A but DOES NOT fulfill strict network guarantee B", () => {
  const afterFence = trace(["enable", "fence", "revoke"]);
  assert.equal(afterFence.fenceCount, 1);
  assert.equal(afterFence.tokenLive, false);
  const example = transition(afterFence, event("hypothetical-provider-start"));
  assert.equal(example.providerStartCount, 1); // Exhibit only; no real request.
  assert.equal(example.realSendAuthorized, false);
});
test("kill switch toggled AFTER fence cannot promise instant cancellation of a started attempt", () => {
  const s = trace(["enable", "fence", "disable", "hypothetical-provider-start"]);
  assert.equal(s.providerStartCount, 1); // Non-guarantee, not recommended behavior.
  assert.equal(s.realSendAuthorized, false);
});
test("crash before fence is not permission to auto-retry a claimed row", () => {
  const s = trace(["enable", "crash"]);
  assert.equal(s.fenceCount, 0);
  assert.equal(s.autoRetry, false);
  assert.equal(s.realSendAuthorized, false);
});
test("crash/timeout after fence is ambiguous, not ready-for-retry", () => {
  for (const kind of ["crash", "timeout"]) {
    const s = trace(["enable", "fence", kind]);
    assert.equal(s.terminal, "uncertain");
    assert.equal(s.autoRetry, false);
    assert.equal(s.providerStartCount, 0);
  }
});
test("hypothetical provider start requires a prior fence in this model", () => {
  assert.equal(trace(["hypothetical-provider-start"]).providerStartCount, 0);
});
test("hypothetical accepted is not inbox delivery, and never grants automatic retry", () => {
  const s = trace(["enable", "fence", "hypothetical-provider-start", "accepted"]);
  assert.equal(s.terminal, "accepted");
  assert.equal(s.inboxDelivered, false);
  assert.equal(s.autoRetry, false);
});
test("all synthetic cases keep real send permission false", () => {
  for (const order of permutations(["enable", "fence", "revoke", "hypothetical-provider-start"])) {
    const s = trace(order);
    assert.equal(s.realSendAuthorized, false, order.join(","));
    assert.equal(s.autoRetry, false, order.join(","));
  }
});
