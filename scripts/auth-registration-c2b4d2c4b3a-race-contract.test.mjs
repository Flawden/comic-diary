/**
 * AUTH-01C2B4D2C4B3A — OFFLINE concurrency/race analysis contract.
 * Synthetic interleavings only. No DB, network, provider, secrets, mail, or
 * runtime dispatcher; THESE TESTS DO NOT AUTHORIZE A SEND.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) => readFileSync(name, "utf8");
const claim = read("src/modules/auth/registration-activation-outbox-claim.ts");
const issue = read("src/modules/auth/registration-activation-outbox-issue.ts");
const dryRun = read("src/modules/auth/registration-activation-outbox-dry-run.ts");
const activation = read("src/modules/auth/registration-activation-service.ts");
const resend = read("src/modules/auth/registration-activation-resend-contract.ts");
const policy = read("src/modules/auth/registration-activation-outbox-policy.ts");
const ddl = read("drizzle/0035_auth_activation_mail_outbox.sql");
const workflow = read(".github/workflows/ci.yml");

// A deliberately tiny MODEL, not product code or an implementation of a fence.
// A linear trace is illustrative; real interleavings can be even more complex.
function model(events) {
  const s = { state: "ready", live: true, checked: false, attempted: false, response: null };
  for (const event of events) {
    if (event === "claim") {
      if (s.state === "ready") s.state = s.live ? "in_flight" : "expired";
    } else if (event === "check") {
      s.checked = s.state === "in_flight" && s.live;
    } else if (event === "revoke") {
      s.live = false;
      if (s.state === "ready") s.state = "expired";
    } else if (event === "attempt") {
      // Hypothetical network boundary: not an action performed by this test.
      // A stale check cannot prevent this attempt after revocation.
      s.attempted = true;
    } else if (event === "accepted" || event === "rejected" || event === "unknown") {
      s.response = event;
    } else if (event === "crash") {
      s.response = s.attempted ? "unknown" : null;
    } else {
      throw new Error("invalid synthetic event");
    }
  }
  return Object.freeze({
    ...s,
    // A check is NEVER a send permission; only a future coordinated protocol
    // and explicitly approved transport may establish a usable boundary.
    sendAuthorized: false,
    automaticRetryAllowed: false,
    inboxDelivered: false,
  });
}

test("claim uses USER -> TOKEN -> OUTBOX row-lock order", () => {
  const start = claim.indexOf("db.transaction(async (tx)");
  assert.ok(start >= 0);
  const body = claim.slice(start, claim.indexOf("/**", start));
  const account = body.indexOf(".from(users)");
  const token = body.indexOf(".from(emailVerificationTokens)");
  const outbox = body.indexOf(".from(activationMailOutbox)");
  assert.ok(0 <= account && account < token && token < outbox);
  assert.equal((body.match(/\.for\("update"\)/g) ?? []).length, 3);
});

test("issuer revokes token and expires only READY rows under the user lock", () => {
  const userLock = issue.indexOf('.from(users).where(eq(users.id, input.userId))');
  const revoke = issue.indexOf('.update(emailVerificationTokens)');
  const readyExpire = issue.indexOf('.update(activationMailOutbox)');
  assert.ok(userLock >= 0 && revoke > userLock && readyExpire > revoke);
  assert.match(issue, /eq\(activationMailOutbox\.state, "ready"\)/);
  assert.doesNotMatch(issue, /\.set\(\{\s*state:\s*"ready"/);
});

test("claim completion has only terminal results and requires durable claim", () => {
  assert.match(claim, /result:\s*"accepted" \| "rejected" \| "uncertain"/);
  assert.match(claim, /item\.state !== "in_flight" \|\| item\.claimId !== input\.claimId/);
  assert.match(claim, /eq\(activationMailOutbox\.claimId, input\.claimId\)/);
  assert.doesNotMatch(claim, /\bfetch\s*\(|\bsendEmail\s*\(/);
});

test("schema distinguishes ready and in_flight; application policy has no retry transition", () => {
  assert.match(ddl, /"state" = 'in_flight' AND "attempt_count" = 1/);
  assert.match(ddl, /"state" = 'ready' AND "attempt_count" = 0/);
  assert.match(policy, /if \(current !== "ready" && current !== "in_flight"\) return null/);
  assert.match(policy, /return "uncertain"/);
});

test("B1 snapshot cannot grant send permission or access a live provider", () => {
  assert.match(dryRun, /sendAuthorized: false/);
  assert.match(dryRun, /eligible_snapshot/);
  assert.doesNotMatch(dryRun, /\bfetch\s*\(|\bprocess\.env\b|\bdb\.transaction\s*\(/);
});

test("Resend contract is inert and unknown result remains uncertain", () => {
  assert.doesNotMatch(resend, /\bfetch\s*\(|\bsetTimeout\s*\(|\bprocess\.env\b/);
  assert.match(resend, /return "uncertain"/);
  assert.match(resend, /idempotencyKey/);
});

test("activation consumes and revokes under account and token locks", () => {
  const a = activation.indexOf('.from(users)');
  const t = activation.indexOf('.from(emailVerificationTokens)', a);
  assert.ok(a >= 0 && t > a);
  assert.match(activation, /\.for\("update"\)/);
  assert.match(activation, /\.set\(\{ revokedAt: now \}\)/);
});

test("revocation before claim leaves no claimable ready delivery", () => {
  const s = model(["revoke", "claim", "check"]);
  assert.equal(s.state, "expired");
  assert.equal(s.checked, false);
  assert.equal(s.sendAuthorized, false);
});

test("revocation after claim but before a fresh check blocks the snapshot", () => {
  const s = model(["claim", "revoke", "check"]);
  assert.equal(s.state, "in_flight");
  assert.equal(s.checked, false);
  assert.equal(s.automaticRetryAllowed, false);
});

test("revocation AFTER successful check exposes the unresolved last-mile gap", () => {
  const s = model(["claim", "check", "revoke", "attempt"]);
  assert.equal(s.checked, true); // Checked only at the earlier moment.
  assert.equal(s.live, false); // Revoked before the illustrative send.
  assert.equal(s.attempted, true); // Unsafe attempt is possible in a naive worker.
  assert.equal(s.sendAuthorized, false); // No product permission exists.
});

test("even a currently live snapshot is not a send authorization", () => {
  const s = model(["claim", "check"]);
  assert.equal(s.live, true);
  assert.equal(s.checked, true);
  assert.equal(s.sendAuthorized, false);
});

test("revocation after attempted provider submission cannot recall that attempt", () => {
  const s = model(["claim", "check", "attempt", "revoke", "accepted"]);
  assert.equal(s.response, "accepted");
  assert.equal(s.live, false);
  assert.equal(s.inboxDelivered, false);
  assert.equal(s.automaticRetryAllowed, false);
});

test("timeout or process crash after attempt must remain uncertain, never retry", () => {
  for (const tail of [["unknown"], ["crash"]]) {
    const s = model(["claim", "check", "attempt", ...tail]);
    assert.equal(s.response, "unknown");
    assert.equal(s.automaticRetryAllowed, false);
    assert.equal(s.inboxDelivered, false);
  }
});

test("provider accepted is not the same as inbox delivered", () => {
  const s = model(["claim", "check", "attempt", "accepted"]);
  assert.equal(s.response, "accepted");
  assert.equal(s.inboxDelivered, false);
});

test("CI invokes only the offline race contract and preserves live PostgreSQL probe", () => {
  assert.match(workflow, /AUTH-01C2B4D2C4B3A offline revocation race contract \(NO delivery\)/);
  assert.match(workflow, /node --test scripts\/auth-registration-c2b4d2c4b3a-race-contract\.test\.mjs/);
  assert.match(workflow, /AUTH-01C2B4D2C4A disposable PostgreSQL claim and terminal states/);
  assert.match(workflow, /run: npm run lint/);
  assert.match(workflow, /run: npm run typecheck/);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/master'/);
});
