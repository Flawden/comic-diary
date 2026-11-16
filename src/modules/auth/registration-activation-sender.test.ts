import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error TS5097: Node standalone type stripping needs .ts; CI uses tsx.
import { prepareActivationSenderEnvelope } from "./registration-activation-sender.ts";
// @ts-expect-error TS5097: Node's standalone type stripping needs .ts; CI uses tsx.
import { buildPendingActivationMail } from "./registration-activation-mail.ts";

const now = new Date("2026-11-16T12:00:00.000Z");
const token = Buffer.alloc(32, 51).toString("base64url");
const origin = "https://reader.example.invalid";
const message = buildPendingActivationMail({
  email: "reader@example.invalid",
  token,
  publicOrigin: origin,
  expiresAt: new Date(now.getTime() + 30 * 60_000),
}, now);
assert.ok(message);
const config = { fromAddress: "no-reply@example.invalid", senderDomain: "example.invalid", publicOrigin: origin };

test("valid sender and exact plain-text mail yields a minimal frozen envelope", () => {
  const envelope = prepareActivationSenderEnvelope(config, message);
  assert.ok(envelope);
  assert.deepEqual(Object.keys(envelope).sort(), ["from", "subject", "text", "to"]);
  assert.equal(envelope.from, config.fromAddress);
  assert.equal(envelope.to, message.to);
  assert.equal(envelope.text, message.text);
  assert.equal(Object.isFrozen(envelope), true);
});

test("sender domain must match exactly, including subdomain boundaries", () => {
  for (const fromAddress of ["no-reply@evil.invalid", "no-reply@sub.example.invalid", "no-reply@example.invalid.evil.invalid", "no-reply@EXAMPLE.invalid"]) {
    assert.equal(prepareActivationSenderEnvelope({ ...config, fromAddress }, message), null);
  }
});

test("unsafe sender forms and header injection are rejected", () => {
  for (const fromAddress of ["Name <no-reply@example.invalid>", "no-reply@example.invalid\r\nBcc:evil@else.invalid", "no reply@example.invalid", ".bad@example.invalid", "bad..dots@example.invalid", "bad.@example.invalid", "no-reply@@example.invalid", "nonasciié@example.invalid"]) {
    assert.equal(prepareActivationSenderEnvelope({ ...config, fromAddress }, message), null);
  }
});

test("sender domain cannot be a suffix trick, IP, or malformed hostname", () => {
  for (const senderDomain of ["", "example.invalid.", "EXAMPLE.invalid", "-bad.invalid", "bad-.invalid", "127.0.0.1", "example.invalid/path", "example..invalid", "test", "sub.example.invalid"]) {
    assert.equal(prepareActivationSenderEnvelope({ ...config, senderDomain }, message), null);
  }
});

test("canonical URL must match the trusted origin, not request-controlled URL", () => {
  for (const publicOrigin of ["http://reader.example.invalid", `${origin}/`, `${origin}/path`, `${origin}?q=1`, "https://reader.example.invalid.evil.invalid", "https://user:password@reader.example.invalid", " "+origin]) {
    assert.equal(prepareActivationSenderEnvelope({ ...config, publicOrigin }, message), null);
  }
  assert.equal(prepareActivationSenderEnvelope(config, { ...message, activationPageUrl: "https://evil.invalid/activate" }), null);
});

test("extra links, including query or fragment secrets, are refused", () => {
  for (const text of [
    message.text + "\nhttps://evil.invalid/collect",
    message.text.replace(`${origin}/activate`, `${origin}/activate?token=${token}`),
    message.text.replace(`${origin}/activate`, `${origin}/activate#token=${token}`),
  ]) {
    assert.equal(prepareActivationSenderEnvelope(config, { ...message, text }), null);
  }
});

test("reject unexpected HTML, attachments and copied recipients", () => {
  for (const extras of [{ html: "<b>Hello</b>" }, { bcc: "evil@else.invalid" }, { headers: { Bcc: "evil@else.invalid" } }, { attachments: [] }]) {
    assert.equal(prepareActivationSenderEnvelope(config, { ...message, ...extras }), null);
  }
});

test("reject subject injection and oversized/untrusted text", () => {
  for (const subject of ["", "Hello\r\nBcc: evil@else.invalid", "x".repeat(151), "Hello\u2028Bcc"] ) {
    assert.equal(prepareActivationSenderEnvelope(config, { ...message, subject }), null);
  }
  for (const text of ["", "x".repeat(8193), message.text + "\rBcc: evil", message.text + "\0"] ) {
    assert.equal(prepareActivationSenderEnvelope(config, { ...message, text }), null);
  }
});

test("reject malformed recipients and don't add return-path or provider metadata", () => {
  for (const to of ["reader@example.invalid\r\nBcc: evil@else.invalid", "reader@@example.invalid", "reader name@example.invalid", "reader@example.invalid,evil@else.invalid"]) {
    assert.equal(prepareActivationSenderEnvelope(config, { ...message, to }), null);
  }
  assert.doesNotMatch(JSON.stringify(prepareActivationSenderEnvelope(config, message)), /"(?:headers|html|attachments|returnPath|provider)"/);
});

test("no accidental acceptance of invalid arguments", () => {
  assert.equal(prepareActivationSenderEnvelope(undefined as never, message), null);
  assert.equal(prepareActivationSenderEnvelope(config, undefined as never), null);
  assert.equal(prepareActivationSenderEnvelope({ ...config, fromAddress: "" }, message), null);
  assert.equal(prepareActivationSenderEnvelope({ ...config, publicOrigin: "" }, message), null);
});
