import assert from "node:assert/strict";
import test from "node:test";
import { canDispatchVerificationPurpose, isVerificationPurpose, legacyVerificationEnabled, legacyVerificationRequestEnabled } from "./verification-purpose";
import { issueEmailVerificationToken } from "./email-verification-token";
import { sealActivationMailOutboxPayload, unsealActivationMailOutboxPayload } from "./registration-activation-outbox-crypto";
import { buildVerificationMail } from "./registration-activation-mail";
import { prepareActivationSenderEnvelope } from "./registration-activation-sender";

const now = new Date();
const legacy = { id: 1, email: "reader@example.invalid", passwordHash: "hash", isActive: true, emailVerifiedAt: null, verificationRequiredAt: null };
test("purpose is strict and each account state remains isolated", () => {
  for (const invalid of [undefined, null, "", "unknown", {}, "PENDING_ACTIVATION"]) {
    assert.equal(isVerificationPurpose(invalid), false);
    assert.equal(canDispatchVerificationPurpose(legacy, invalid), false);
  }
  assert.equal(canDispatchVerificationPurpose(legacy, "pending_activation"), false);
  assert.equal(canDispatchVerificationPurpose(legacy, "legacy_email_verification"), true);
  const pending = { ...legacy, verificationRequiredAt: now };
  assert.equal(canDispatchVerificationPurpose(pending, "pending_activation"), true);
  assert.equal(canDispatchVerificationPurpose(pending, "legacy_email_verification"), false);
  for (const account of [{ ...legacy, isActive: false }, { ...legacy, emailVerifiedAt: now }, { ...legacy, passwordHash: null }])
    for (const purpose of ["pending_activation", "legacy_email_verification"]) assert.equal(canDispatchVerificationPurpose(account, purpose), false);
});
test("both gates are default OFF and accept only exact true", () => {
  for (const value of [undefined, "false", "1", "TRUE", " true", ""]) {
    assert.equal(legacyVerificationEnabled({ AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED: value }), false);
    assert.equal(legacyVerificationRequestEnabled({ AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED: "true", AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED: value }), false);
  }
  assert.equal(legacyVerificationRequestEnabled({ AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED: "true" }), false);
  assert.equal(legacyVerificationRequestEnabled({ AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED: "true", AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED: "true" }), true);
});
test("v1 pending compatibility and v2 purpose authentication prevent cross-purpose decrypt", () => {
  const issued = issueEmailVerificationToken(now);
  const plain = { email: legacy.email, token: issued.token, publicOrigin: "https://reader.example.invalid", expiresAt: issued.expiresAt };
  const key = { keyId: "unit", bytes: new Uint8Array(32).fill(7) };
  const keys = new Map([[key.keyId, key.bytes]]);
  const binding = { verificationTokenId: 1, idempotencyKey: "A".repeat(32), expiresAt: issued.expiresAt };
  const pending = sealActivationMailOutboxPayload(plain, binding, key, now)!;
  assert.deepEqual(unsealActivationMailOutboxPayload(pending, { ...binding, purpose: "pending_activation" }, keys, now), plain);
  const legacyBinding = { ...binding, purpose: "legacy_email_verification" as const };
  const encrypted = sealActivationMailOutboxPayload(plain, legacyBinding, key, now)!;
  assert.deepEqual(unsealActivationMailOutboxPayload(encrypted, legacyBinding, keys, now), plain);
  assert.equal(unsealActivationMailOutboxPayload(encrypted, binding, keys, now), null);
  assert.equal(unsealActivationMailOutboxPayload(pending, legacyBinding, keys, now), null);
  assert.equal(unsealActivationMailOutboxPayload(encrypted, { ...binding, purpose: "unknown" } as never, keys, now), null);
});
test("legacy template uses only canonical account URL and never asks for a new password", () => {
  const issued = issueEmailVerificationToken(now);
  const plain = { email: legacy.email, token: issued.token, publicOrigin: "https://reader.example.invalid", expiresAt: issued.expiresAt };
  const config = { publicOrigin: plain.publicOrigin, fromAddress: "mail@example.invalid", senderDomain: "example.invalid" };
  const mail = buildVerificationMail(plain, "legacy_email_verification", now)!;
  assert.equal(mail.activationPageUrl, plain.publicOrigin + "/account");
  assert.ok(prepareActivationSenderEnvelope(config, mail, "legacy_email_verification"));
  assert.equal(prepareActivationSenderEnvelope(config, mail, "pending_activation"), null);
  const pending = buildVerificationMail(plain, "pending_activation", now)!;
  assert.ok(prepareActivationSenderEnvelope(config, pending));
  for (const unknown of [undefined, null, "unknown", ""]) assert.equal(prepareActivationSenderEnvelope(config, pending, unknown), null);
  assert.equal(buildVerificationMail(plain, "unknown", now), null);
  assert.doesNotMatch(mail.text, /НОВЫЙ пароль|\/activate/);
  assert.equal(prepareActivationSenderEnvelope(config, { ...mail, text: mail.text + " https://evil.invalid" }, "legacy_email_verification"), null);
});
