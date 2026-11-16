import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error TS5097: Node strip-types runner needs .ts; CI uses tsx.
import { buildPendingActivationMail } from "./registration-activation-mail.ts";
// @ts-expect-error TS5097: Node strip-types runner needs .ts; CI uses tsx.
import { prepareResendActivationCandidate, classifyResendCandidateReply } from "./registration-activation-resend-contract.ts";

const now = new Date("2026-11-16T12:00:00Z");
const token = Buffer.alloc(32, 51).toString("base64url");
const origin = "https://reader.example.invalid";
const config = { fromAddress: "no-reply@example.invalid", senderDomain: "example.invalid", publicOrigin: origin };
const mail = buildPendingActivationMail({
  email: "reader@example.invalid", token, expiresAt: new Date(now.getTime() + 30 * 60_000), publicOrigin: origin,
}, now);
assert.ok(mail);
const key = "activation/" + Buffer.alloc(16, 83).toString("base64url");
const id = "22222222-aaaa-4444-8888-cccccccccccc";

test("exact API candidate is HTTPS POST, with text-only four-field payload", () => {
  const request = prepareResendActivationCandidate(config, mail, key);
  assert.ok(request);
  assert.deepEqual(Object.keys(request).sort(), ["endpoint", "idempotencyKey", "method", "payload"]);
  assert.equal(request.endpoint, "https://api.resend.com/emails");
  assert.equal(request.method, "POST");
  assert.deepEqual(Object.keys(request.payload).sort(), ["from", "subject", "text", "to"]);
  assert.deepEqual(request.payload.to, [mail.to]);
  assert.equal(request.payload.from, config.fromAddress);
  assert.equal(request.payload.text, mail.text);
});

test("candidate has no authorization, tracking, HTML, attachment or copied recipient", () => {
  const request = prepareResendActivationCandidate(config, mail, key);
  assert.ok(request);
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.payload), true);
  assert.equal(Object.isFrozen(request.payload.to), true);
  assert.doesNotMatch(JSON.stringify(Object.keys(request)), /authorization|secret|password|apiKey/i);
  assert.doesNotMatch(JSON.stringify(request.payload), /\"(?:html|cc|bcc|attachments|headers|reply_to|tracking)\"/);
});

test("raw code stays only in text, not URL, subject, key or sender metadata", () => {
  const request = prepareResendActivationCandidate(config, mail, key);
  assert.ok(request);
  assert.equal(request.payload.text.includes(token), true);
  assert.equal(request.endpoint.includes(token), false);
  assert.equal(request.idempotencyKey.includes(token), false);
  assert.equal(request.payload.subject.includes(token), false);
  assert.equal(request.payload.from.includes(token), false);
  assert.equal(mail.activationPageUrl.includes(token), false);
});

test("canonical independent random idempotency key required", () => {
  for (const invalid of ["", "activation/", "activation/abc", "activation/" + token, "activation/" + "a".repeat(22), "activation/" + Buffer.alloc(16, 9).toString("base64url") + "A", "activation/" + Buffer.alloc(16, 3).toString("base64url") + "\r\nX: bad", "activation/" + "reader@example.invalid", "activation/" + "0".repeat(32)]) {
    assert.equal(prepareResendActivationCandidate(config, mail, invalid), null);
  }
});

test("same input yields deterministic identical payload for SAME outbox issuance", () => {
  const first = prepareResendActivationCandidate(config, mail, key);
  const second = prepareResendActivationCandidate(config, mail, key);
  assert.deepEqual(first, second);
});

test("unsafe sender or origin fails closed before candidate construction", () => {
  assert.equal(prepareResendActivationCandidate({ ...config, fromAddress: "bad@evil.invalid" }, mail, key), null);
  assert.equal(prepareResendActivationCandidate({ ...config, publicOrigin: "http://reader.example.invalid" }, mail, key), null);
  assert.equal(prepareResendActivationCandidate(config, { ...mail, text: mail.text + "\rBcc:evil@example.invalid" }, key), null);
});

test("only strict raw 200/201 provider id is classified accepted", () => {
  for (const status of [200, 201]) assert.equal(classifyResendCandidateReply(status, { id }), "accepted");
});

test("bad successful response is uncertain, never falsely accepted", () => {
  for (const body of [null, [], { id: "" }, { id: 42 }, { error: "fail" }, { id, error: "secret" }, { data: { id } }]) {
    assert.equal(classifyResendCandidateReply(200, body), "uncertain");
  }
  assert.equal(classifyResendCandidateReply(204, { id }), "uncertain");
});

test("explicit 400/401/403/404/422 are rejected, without provider error text", () => {
  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(classifyResendCandidateReply(status, { message: "private recipient and token" }), "rejected");
  }
});

test("409 conflict, 429, 5xx and lost response are uncertain; no retry decision", () => {
  for (const status of [undefined, NaN, -1, 0, 409, 408, 429, 500, 502, 503, 504]) {
    assert.equal(classifyResendCandidateReply(status, { message: "untrusted" }), "uncertain");
  }
});

test("provider response is always reduced to one safe enum", () => {
  const privateValue = `sensitive-${token}-reader@example.invalid`;
  for (const status of [200, 400, 409, 500]) {
    const output = classifyResendCandidateReply(status, { error: privateValue, id });
    assert.ok(["accepted", "rejected", "uncertain"].includes(output));
    assert.equal(output.includes(privateValue), false);
  }
});

test("malformed, missing and extra candidate inputs never bypass boundary", () => {
  assert.equal(prepareResendActivationCandidate(null as never, mail, key), null);
  assert.equal(prepareResendActivationCandidate(config, null as never, key), null);
  assert.equal(prepareResendActivationCandidate(config, { ...mail, bcc: "hijack@example.invalid" } as never, key), null);
});
