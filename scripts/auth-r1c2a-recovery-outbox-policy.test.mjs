/** R1C2A: no SQL, provider, email, environment keys or send side effects. */
import assert from "node:assert/strict";
import test from "node:test";
import { deriveRecoveryOutboxNextState as next } from "../src/modules/auth/password-reset-request-outbox-policy.ts";

const now = new Date("2026-11-18T00:00:00.000Z");
const expiresAt = new Date(now.getTime() + 20 * 60_000);
const claimed = { kind: "claimed", now, expiresAt };

test("ready may propose durable claim within 20-minute recovery TTL", () => {
  assert.equal(next("ready", claimed), "in_flight");
  assert.equal(next("ready", { ...claimed, expiresAt: new Date(now.getTime() + 60_001) }), "in_flight");
});

test("claim rejects expired, near-expired and implausible remaining TTL", () => {
  for (const delta of [-1, 0, 60_000, 20 * 60_000 + 1]) {
    assert.equal(next("ready", { ...claimed, expiresAt: new Date(now.getTime() + delta) }), null);
  }
});

test("claim rejects malformed, missing, non-Date and invalid times", () => {
  for (const value of [new Date(NaN), undefined, null, "2026-11-18", 0]) {
    assert.equal(next("ready", { ...claimed, expiresAt: value }), null);
    assert.equal(next("ready", { ...claimed, now: value }), null);
  }
});

test("clock expiry only applies to ready at or after deadline", () => {
  assert.equal(next("ready", { kind: "expired", now: expiresAt, expiresAt }), "expired");
  assert.equal(next("ready", { kind: "expired", now, expiresAt }), null);
  assert.equal(next("in_flight", { kind: "expired", now: expiresAt, expiresAt }), null);
});

test("revocation/invalidity may expire only ready, not a claimed item", () => {
  assert.equal(next("ready", { kind: "invalidated", now }), "expired");
  assert.equal(next("in_flight", { kind: "invalidated", now }), null);
  assert.equal(next("ready", { kind: "invalidated", now: new Date(NaN) }), null);
});

test("provider accepted means accepted submission, NOT inbox delivery", () => {
  assert.equal(next("in_flight", { kind: "provider_result", result: "accepted" }), "accepted");
});

test("explicit rejection is terminal", () => {
  assert.equal(next("in_flight", { kind: "provider_result", result: "rejected" }), "rejected");
});

test("ambiguous result is uncertain", () => {
  assert.equal(next("in_flight", { kind: "provider_result", result: "uncertain" }), "uncertain");
});

test("exception is uncertain and never eligible for automatic retry", () => {
  assert.equal(next("in_flight", { kind: "transport_error" }), "uncertain");
  assert.equal(next("uncertain", claimed), null);
});

test("provider cannot transition ready without a durable claim", () => {
  for (const result of ["accepted", "rejected", "uncertain"]) {
    assert.equal(next("ready", { kind: "provider_result", result }), null);
  }
});

test("in_flight cannot be claimed a second time", () => {
  assert.equal(next("in_flight", claimed), null);
});

test("all terminal states remain terminal for every event", () => {
  const events = [claimed, { kind: "transport_error" }, { kind: "invalidated", now },
    { kind: "provider_result", result: "accepted" }, { kind: "expired", now: expiresAt, expiresAt }];
  for (const state of ["accepted", "rejected", "uncertain", "expired"]) {
    for (const event of events) assert.equal(next(state, event), null);
  }
});

test("extra fields and malformed actions fail closed", () => {
  assert.equal(next("ready", { ...claimed, token: "hidden" }), null);
  assert.equal(next("ready", { kind: "invalidated", now, reason: "unknown" }), null);
  assert.equal(next("in_flight", { kind: "transport_error", retry: true }), null);
  assert.equal(next("in_flight", { kind: "provider_result", result: "delivered" }), null);
  assert.equal(next("in_flight", { kind: "provider_result", result: "retry" }), null);
  assert.equal(next("ready", { kind: "resend" }), null);
  assert.equal(next("ready", null), null);
  assert.equal(next("ready", []), null);
  assert.equal(next("ready", Object.create(null)), null);
});

test("unknown states and direct sends are never authorized", () => {
  assert.equal(next("delivered", claimed), null);
  assert.equal(next("ready", { kind: "send" }), null);
  assert.equal(next("ready", { kind: "new_token" }), null);
});
