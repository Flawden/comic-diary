import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error TS5097: Node strip-types needs .ts; CI uses tsx.
import { deriveActivationOutboxNextState as next } from "./registration-activation-outbox-policy.ts";

const now = new Date("2026-11-16T13:00:00Z");
const expiresAt = new Date(now.getTime() + 30 * 60_000);
const claim = { kind: "claimed", now, expiresAt } as const;

test("ready item with durable claim can become in-flight (policy only)", () => {
  assert.equal(next("ready", claim), "in_flight");
});

test("claim refuses exactly one minute, expired and too-distant code", () => {
  for (const delta of [0, -100, 60_000, 30 * 60_000 + 1]) {
    assert.equal(next("ready", { ...claim, expiresAt: new Date(now.getTime() + delta) }), null);
  }
  assert.equal(next("ready", { ...claim, expiresAt: new Date(now.getTime() + 60_001) }), "in_flight");
});

test("claim refuses invalid Date, missing now and invalid state", () => {
  assert.equal(next("ready", { ...claim, now: new Date(NaN) }), null);
  assert.equal(next("ready", { ...claim, expiresAt: new Date(NaN) }), null);
  assert.equal(next("ready", { ...claim, now: null } as never), null);
  assert.equal(next("something" as never, claim), null);
});

test("only a ready item may be marked expired", () => {
  assert.equal(next("ready", { kind: "expired", now: expiresAt, expiresAt }), "expired");
  assert.equal(next("ready", { kind: "expired", now, expiresAt }), null);
  assert.equal(next("in_flight", { kind: "expired", now: expiresAt, expiresAt }), null);
});

test("provider accepted becomes accepted, not delivered", () => {
  assert.equal(next("in_flight", { kind: "provider_result", result: "accepted" }), "accepted");
});

test("explicit provider rejection is terminal", () => {
  assert.equal(next("in_flight", { kind: "provider_result", result: "rejected" }), "rejected");
});

test("ambiguous provider outcomes remain uncertain", () => {
  assert.equal(next("in_flight", { kind: "provider_result", result: "uncertain" }), "uncertain");
});

test("transport exception is always uncertain, never a safe retry", () => {
  assert.equal(next("in_flight", { kind: "transport_error" }), "uncertain");
});

test("provider results cannot skip durable claim", () => {
  for (const result of ["accepted", "rejected", "uncertain"] as const) {
    assert.equal(next("ready", { kind: "provider_result", result }), null);
  }
});

test("cannot automatically retry an in-flight item", () => {
  assert.equal(next("in_flight", claim), null);
});

test("terminal statuses never transition or requeue", () => {
  for (const state of ["accepted", "rejected", "uncertain", "expired"] as const) {
    for (const event of [claim, { kind: "provider_result", result: "accepted" } as const, { kind: "transport_error" } as const]) {
      assert.equal(next(state, event), null);
    }
  }
});

test("extra or malformed event fields fail closed", () => {
  assert.equal(next("ready", { ...claim, to: "bad@example.invalid" } as never), null);
  assert.equal(next("in_flight", { kind: "provider_result", result: "accepted", token: "secret" } as never), null);
  assert.equal(next("in_flight", { kind: "transport_error", retry: true } as never), null);
  assert.equal(next("in_flight", { kind: "provider_result", result: "delivered" } as never), null);
  assert.equal(next("ready", null as never), null);
});

test("unknown events never authorize sending or fresh token creation", () => {
  assert.equal(next("ready", { kind: "resend" } as never), null);
  assert.equal(next("in_flight", { kind: "retry" } as never), null);
  assert.equal(next("uncertain", { kind: "new_token" } as never), null);
});
