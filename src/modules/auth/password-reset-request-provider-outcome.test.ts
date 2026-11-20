/** AUTH-01 R1C2C4: pure classification, no network, DB, secrets or mail. */
import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error TS5097: Node direct strip-types requires .ts; tsx in CI supports it.
import { classifyRecoveryProviderOutcome as classify } from "./password-reset-request-provider-outcome.ts";
const accepted = { classification: "accepted", sendAuthorized: false, retryAuthorized: false };
const rejected = { classification: "rejected", sendAuthorized: false, retryAuthorized: false };
const uncertain = { classification: "uncertain", sendAuthorized: false, retryAuthorized: false };
test("explicit positive provider acceptance only", () => {
  assert.deepEqual(classify({ kind: "provider_accepted", acknowledged: true }), accepted);
});
test("definitive provider non-acceptance only", () => {
  assert.deepEqual(classify({ kind: "provider_rejected", definitivelyNotAccepted: true }), rejected);
});
test("timeout or unknown transport is terminal uncertain, never retry", () => {
  assert.deepEqual(classify({ kind: "transport_uncertain" }), uncertain);
});
test("malformed outcomes never produce accepted", () => {
  for (const e of [null, undefined, false, true, 200, "accepted", [], {}, Object.create(null),
    { kind: "provider_accepted" }, { kind: "provider_accepted", acknowledged: false },
    { kind: "provider_rejected", definitivelyNotAccepted: false },
    { kind: "provider_accepted", acknowledged: "true" },
    { kind: "provider_rejected", definitivelyNotAccepted: 1 },
    { kind: "provider_accepted", acknowledged: true, email: "someone@example.invalid" },
    { kind: "provider_rejected", definitivelyNotAccepted: true, retry: true },
    { kind: "transport_uncertain", retry: true },
    { kind: "unknown", acknowledged: true },
    new Date(),
  ]) assert.deepEqual(classify(e), uncertain);
});
test("inherited or exotic objects cannot grant provider acceptance", () => {
  const inherited = Object.create({ kind: "provider_accepted", acknowledged: true });
  assert.deepEqual(classify(inherited), uncertain);
  assert.deepEqual(classify(new Proxy({}, { getPrototypeOf() { throw Error("blocked"); } })), uncertain);
});
test("the classifier never grants sending or retrying", () => {
  for (const evidence of [
    { kind: "provider_accepted", acknowledged: true },
    { kind: "provider_rejected", definitivelyNotAccepted: true },
    { kind: "transport_uncertain" },
  ]) {
    const result = classify(evidence);
    assert.equal(result.sendAuthorized, false);
    assert.equal(result.retryAuthorized, false);
    assert.deepEqual(Object.keys(result).sort(), ["classification", "retryAuthorized", "sendAuthorized"]);
    assert.equal(Object.isFrozen(result), true);
  }
});
