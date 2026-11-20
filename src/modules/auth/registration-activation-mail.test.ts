import assert from "node:assert/strict";
import test from "node:test";
import {
  activationMailDeliveryEnabled,
  buildPendingActivationMail,
  canonicalActivationMailOrigin,
  deliverPendingActivationMail,
  // @ts-expect-error TS5097: standalone Termux Node type stripping needs .ts; CI uses tsx.
} from "./registration-activation-mail.ts";

const now = new Date("2026-11-16T12:00:00.000Z");
const token = Buffer.alloc(32, 23).toString("base64url");
const valid = {
  email: "recipient@example.invalid",
  token,
  publicOrigin: "https://comic.example.invalid",
  expiresAt: new Date(now.getTime() + 30 * 60_000),
};

test("mail sending requires exact operator opt-in", () => {
  for (const value of [undefined, "", "TRUE", "1", "on", " true ", "false"]) {
    assert.equal(activationMailDeliveryEnabled(value), false);
  }
  assert.equal(activationMailDeliveryEnabled("true"), true);
});

test("canonical mail origin accepts only exact HTTPS deployment origins", () => {
  assert.equal(canonicalActivationMailOrigin(valid.publicOrigin), valid.publicOrigin);
  for (const bad of ["", "http://comic.example.invalid", "https://comic.example.invalid/", "https://comic.example.invalid/path", "https://comic.example.invalid?x=1", "https://comic.example.invalid#x", "https://user:pw@comic.example.invalid", "https://comic.example.invalid ", "//comic.example.invalid", "https://comic.example.invalid.evil.invalid/"]) {
    assert.equal(canonicalActivationMailOrigin(bad), null, bad);
  }
});

test("mail carries the raw code only in body, never in a URL or subject", () => {
  const mail = buildPendingActivationMail(valid, now);
  assert.ok(mail);
  assert.equal(mail.to, valid.email);
  assert.equal(mail.activationPageUrl, `${valid.publicOrigin}/activate`);
  assert.ok(mail.text.includes(token));
  assert.ok(mail.text.includes("НОВЫЙ пароль"));
  assert.ok(mail.text.includes("не регистрировались"));
  assert.ok(!mail.activationPageUrl.includes(token));
  assert.ok(!mail.subject.includes(token));
  assert.ok(!mail.text.includes(`?token=${token}`));
  assert.ok(!mail.text.includes(`#token=${token}`));
});

test("rejects recipient control characters and malformed codes", () => {
  for (const email of ["a@example.invalid\nBcc: attacker@evil.invalid", "a@example.invalid\r", "x", "recipient@@example.invalid", "x y@example.invalid", "person,copy@example.invalid", "person<victim>@example.invalid"]) {
    assert.equal(buildPendingActivationMail({ ...valid, email }, now), null);
  }
  for (const token of ["", "x".repeat(42), "?".repeat(43), "_".repeat(43)]) {
    assert.equal(buildPendingActivationMail({ ...valid, token }, now), null);
  }
});

test("rejects expired, near-expired and invalid expiry without transport", () => {
  for (const expiresAt of [new Date(NaN), now, new Date(now.getTime() + 60_000), new Date(now.getTime() + 31 * 60_000)]) {
    assert.equal(buildPendingActivationMail({ ...valid, expiresAt }, now), null);
  }
  assert.equal(buildPendingActivationMail({ ...valid, publicOrigin: "http://comic.example.invalid" }, now), null);
});

test("disabled mail never invokes sender or exposes token", async () => {
  let invoked = 0;
  const status = await deliverPendingActivationMail({
    enabled: "false",
    message: valid,
    now,
    transport: async () => { invoked += 1; return { accepted: true }; },
  });
  assert.equal(status, "disabled");
  assert.equal(invoked, 0);
});

test("enabled but missing sender fails closed", async () => {
  assert.equal(await deliverPendingActivationMail({ enabled: "true", transport: undefined, message: valid, now }), "unavailable");
});

test("sender accepts one plain-text message and returns status only", async () => {
  let mailCount = 0;
  const result = await deliverPendingActivationMail({
    enabled: "true", message: valid, now,
    transport: async (mail) => {
      mailCount++;
      assert.equal(mail.to, valid.email);
      assert.equal(mail.activationPageUrl, "https://comic.example.invalid/activate");
      assert.ok(mail.text.includes(token));
      return { accepted: true };
    },
  });
  assert.equal(mailCount, 1);
  assert.equal(result, "accepted");
});

test("sender denial and provider exception do not echo sensitive values", async () => {
  const denied = await deliverPendingActivationMail({ enabled: "true", message: valid, now, transport: async () => ({ accepted: false }) });
  const thrown = await deliverPendingActivationMail({ enabled: "true", message: valid, now, transport: async () => { throw new Error(`transport error ${token}`); } });
  assert.equal(denied, "unavailable");
  assert.equal(thrown, "unavailable");
  assert.ok(!JSON.stringify({ denied, thrown }).includes(token));
});

test("invalid origin or expired message must not invoke a provider", async () => {
  let invoked = 0;
  const transport = async () => { invoked += 1; return { accepted: true }; };
  const status = await deliverPendingActivationMail({ enabled: "true", message: { ...valid, publicOrigin: "http://evil.invalid" }, transport, now });
  assert.equal(status, "unavailable");
  assert.equal(invoked, 0);
});
