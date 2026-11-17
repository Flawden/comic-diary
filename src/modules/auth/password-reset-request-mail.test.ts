import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  buildPasswordResetRecoveryMail,
  canonicalPasswordResetMailOrigin,
// @ts-expect-error TS5097: Node strip-types standalone test imports the .ts source.
} from "./password-reset-request-mail.ts";

const now = new Date("2026-11-17T17:00:00.000Z");
const token = randomBytes(32).toString("base64url");
const good = () => ({
  verifiedEmail: "reader@example.org",
  token,
  expiresAt: new Date(now.getTime() + 20 * 60_000),
  publicOrigin: "https://comic.example.org",
});

test("builds code-only-in-body recovery message from trusted mailbox", () => {
  const mail = buildPasswordResetRecoveryMail(good(), now);
  assert.ok(mail);
  assert.equal(mail.to, "reader@example.org");
  assert.equal(mail.recoveryPageUrl, "https://comic.example.org/reset-password");
  assert.ok(mail.text.includes(token));
  assert.ok(mail.text.includes("проигнорируйте"));
  assert.equal(mail.recoveryPageUrl.includes(token), false);
  assert.equal(mail.subject.includes(token), false);
});

test("rejects noncanonical or non-HTTPS origins and header-derived URLs", () => {
  for (const origin of ["http://comic.example.org", "https://comic.example.org/other", "https://comic.example.org/", "https://reader@comic.example.org", "https://comic.example.org?code=1", " https://comic.example.org", "https://comic.example.org#abc", "not a url"]) {
    assert.equal(canonicalPasswordResetMailOrigin(origin), null);
    assert.equal(buildPasswordResetRecoveryMail({ ...good(), publicOrigin: origin }, now), null);
  }
});

test("rejects malformed or noncanonical secrets", () => {
  for (const value of ["", "evil?code=", token + "=", token.slice(1), token + "\r\nHeader: injected"]) {
    assert.equal(buildPasswordResetRecoveryMail({ ...good(), token: value }, now), null);
  }
});

test("rejects injected or untrustworthy mailbox values", () => {
  for (const email of ["", "not-an-email", "attacker@example.org\r\nBCC:evil@example.org", "Reader <reader@example.org>", "x".repeat(320) + "@a.b", "reader@example.org "]) {
    assert.equal(buildPasswordResetRecoveryMail({ ...good(), verifiedEmail: email }, now), null);
  }
});

test("refuses expired, nearly expired, or too-far-away codes", () => {
  for (const offset of [-1, 0, 60_000, 20 * 60_000 + 1]) {
    assert.equal(buildPasswordResetRecoveryMail({ ...good(), expiresAt: new Date(now.getTime() + offset) }, now), null);
  }
  assert.ok(buildPasswordResetRecoveryMail({ ...good(), expiresAt: new Date(now.getTime() + 61_000) }, now));
});

test("rejects invalid timestamps and untrusted types", () => {
  assert.equal(buildPasswordResetRecoveryMail({ ...good(), expiresAt: new Date(NaN) }, now), null);
  assert.equal(buildPasswordResetRecoveryMail(good(), new Date(NaN)), null);
  assert.equal(buildPasswordResetRecoveryMail({ ...good(), token: 5 as unknown as string }, now), null);
  assert.equal(buildPasswordResetRecoveryMail({ ...good(), verifiedEmail: null as unknown as string }, now), null);
});
