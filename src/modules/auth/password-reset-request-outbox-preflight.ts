/**
 * AUTH-01 / R1C2C1: PURE / OFFLINE recovery-mail snapshot preflight.
 *
 * No database access, provider, worker, network, environment/key loader, mail
 * dispatch, retries or state changes. The caller supplies ALREADY LOCKED trusted
 * row snapshots and an ephemeral AEAD keyring. No recipient, raw recovery code,
 * decrypted payload or mail body is returned or logged.
 *
 * An eligible snapshot NEVER grants permission to send: user/token/outbox may
 * change after the caller releases locks. A future durable dispatch fence,
 * operator-controlled reservation and separately reviewed sender are required.
 */
import { timingSafeEqual } from "node:crypto";
// @ts-expect-error TS5097: local Node 22 strip-types uses .ts; project CI uses tsx.
import { canQueuePasswordResetForAccount } from "./password-reset-request-policy.ts";
// @ts-expect-error TS5097: local Node 22 strip-types uses .ts; project CI uses tsx.
import { hashPasswordResetToken } from "./password-reset-token.ts";
// @ts-expect-error TS5097: local Node 22 strip-types uses .ts; project CI uses tsx.
import { canonicalPasswordResetMailOrigin, buildPasswordResetRecoveryMail } from "./password-reset-request-mail.ts";
// @ts-expect-error TS5097: local Node 22 strip-types uses .ts; project CI uses tsx.
import { unsealPasswordResetMailOutboxPayload } from "./password-reset-request-outbox-crypto.ts";

export type RecoveryPreflightAccount = Readonly<{
  id: number; email: string; passwordHash: string | null;
  emailVerifiedAt: Date | null; isActive: boolean;
}>;
export type RecoveryPreflightToken = Readonly<{
  id: number; userId: number; tokenHash: string;
  createdAt: Date; expiresAt: Date; consumedAt: Date | null;
  revokedAt: Date | null;
}>;
export type RecoveryPreflightOutbox = Readonly<{
  id: number; passwordResetTokenId: number; idempotencyKey: string;
  state: string; claimId: string | null; attemptCount: number;
  createdAt: Date; claimedAt: Date | null; expiresAt: Date;
  finalizedAt: Date | null;
  payloadCiphertext: string; payloadNonce: string;
  payloadKeyId: string; payloadDigest: string;
}>;
export type RecoveryPreflightSnapshot = Readonly<{
  account: RecoveryPreflightAccount;
  token: RecoveryPreflightToken;
  outbox: RecoveryPreflightOutbox;
}>;
export type RecoveryPreflightResult = Readonly<{
  status: "eligible_snapshot" | "blocked";
  sendAuthorized: false;
}>;
const BLOCKED: RecoveryPreflightResult = Object.freeze({ status: "blocked", sendAuthorized: false });
const ELIGIBLE: RecoveryPreflightResult = Object.freeze({ status: "eligible_snapshot", sendAuthorized: false });
const HASH = /^[a-f0-9]{64}$/;
const B64_24 = /^[A-Za-z0-9_-]{32}$/;
const MAX_ID = 2147483647;
const TTL_MS = 20 * 60_000;

function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_ID;
}
function millis(value: unknown): number {
  return value instanceof Date ? value.getTime() : NaN;
}
function canonical24(value: unknown): value is string {
  if (typeof value !== "string" || !B64_24.test(value)) return false;
  const bytes = Buffer.from(value, "base64url");
  return bytes.length === 24 && bytes.toString("base64url") === value;
}
function sameHash(left: unknown, right: unknown): boolean {
  if (typeof left !== "string" || typeof right !== "string" ||
      !HASH.test(left) || !HASH.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

/**
 * Only evaluates supplied snapshots, suitable for offline QA and for reuse by
 * a FUTURE locked DB fence. NEVER use `eligible_snapshot` as a send capability.
 */
export function preflightClaimedPasswordResetMailDryRun(input: Readonly<{
  snapshot: RecoveryPreflightSnapshot;
  claimId: string;
  expectedPublicOrigin: string;
  operatorDryRunEnabled: boolean;
  keys: ReadonlyMap<string, Uint8Array>;
  now: Date;
}>): RecoveryPreflightResult {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).length !== 6 ||
        input.operatorDryRunEnabled !== true || !(input.keys instanceof Map)) return BLOCKED;
    const { account, token, outbox } = input.snapshot ?? {} as RecoveryPreflightSnapshot;
    if (!account || !token || !outbox || !validId(account.id) ||
        !validId(token.id) || !validId(token.userId) ||
        !validId(outbox.id) || !validId(outbox.passwordResetTokenId)) return BLOCKED;

    const nowMs = millis(input.now), issuedMs = millis(token.createdAt);
    const expiresMs = millis(token.expiresAt), createdMs = millis(outbox.createdAt);
    const claimedMs = millis(outbox.claimedAt), verifiedMs = millis(account.emailVerifiedAt);
    const remaining = expiresMs - nowMs;
    if (![nowMs, issuedMs, expiresMs, createdMs, claimedMs, verifiedMs].every(Number.isFinite) ||
        verifiedMs > issuedMs || issuedMs > createdMs || createdMs > claimedMs ||
        claimedMs > nowMs || remaining <= 60_000 || remaining > TTL_MS ||
        expiresMs - issuedMs > TTL_MS || expiresMs <= issuedMs ||
        millis(outbox.expiresAt) !== expiresMs) return BLOCKED;

    if (outbox.state !== "in_flight" || outbox.attemptCount !== 1 ||
        outbox.finalizedAt !== null || token.consumedAt !== null ||
        token.revokedAt !== null || token.userId !== account.id ||
        token.id !== outbox.passwordResetTokenId ||
        !canQueuePasswordResetForAccount(account, account.email)) return BLOCKED;

    if (!canonical24(input.claimId) || !canonical24(outbox.claimId) ||
        input.claimId !== outbox.claimId || !canonical24(outbox.idempotencyKey)) return BLOCKED;
    const origin = canonicalPasswordResetMailOrigin(input.expectedPublicOrigin);
    if (!origin) return BLOCKED;

    const payload = unsealPasswordResetMailOutboxPayload({
      payloadCiphertext: outbox.payloadCiphertext,
      payloadNonce: outbox.payloadNonce,
      payloadKeyId: outbox.payloadKeyId,
      payloadDigest: outbox.payloadDigest,
    }, {
      passwordResetTokenId: token.id,
      idempotencyKey: outbox.idempotencyKey,
      expiresAt: token.expiresAt,
    }, input.keys, input.now);
    if (!payload || payload.email !== account.email ||
        payload.publicOrigin !== origin ||
        !sameHash(token.tokenHash, hashPasswordResetToken(payload.token))) return BLOCKED;

    // Validate the existing provider-neutral mail contract without exposing it.
    if (!buildPasswordResetRecoveryMail({
      verifiedEmail: account.email,
      token: payload.token,
      publicOrigin: origin,
      expiresAt: token.expiresAt,
    }, input.now)) return BLOCKED;
    return ELIGIBLE;
  } catch {
    // Never leak email, plaintext token, crypto errors or secrets through failures.
    return BLOCKED;
  }
}
