/**
 * AUTH-01C2B4D2C4B1: OFFLINE SNAPSHOT PREFLIGHT ONLY.
 *
 * Evaluates already-obtained trusted row snapshots with a caller-supplied AEAD
 * keyring. Never reads DB, environment, secrets, files, or network; never
 * delivers mail, writes a claim, finalizes, retries or schedules work.
 *
 * IMPORTANT: "eligible_snapshot" is NOT send authorization. After this call,
 * account/token status or the operator kill switch can change. The future
 * dispatcher must solve the atomic last-mile revalidation/revocation race
 * before allowing ANY network boundary. Never use this result to call fetch.
 */
import { timingSafeEqual } from "node:crypto";
// @ts-expect-error TS5097: Node 22 standalone strip-types requires .ts; CI uses tsx.
import { canIssueEmailVerification } from "./email-verification-policy.ts";
// @ts-expect-error TS5097: standalone Node strip-types; CI uses tsx.
import { hashEmailVerificationToken } from "./email-verification-token.ts";
// @ts-expect-error TS5097: standalone Node strip-types; CI uses tsx.
import { canonicalActivationMailOrigin, buildPendingActivationMail } from "./registration-activation-mail.ts";
// @ts-expect-error TS5097: standalone Node strip-types; CI uses tsx.
import { needsSecurePendingActivation } from "./registration-activation-policy.ts";
// @ts-expect-error TS5097: standalone Node strip-types; CI uses tsx.
import { unsealActivationMailOutboxPayload } from "./registration-activation-outbox-crypto.ts";

export type DryRunActivationAccount = Readonly<{
  id: number; email: string; passwordHash: string | null;
  isActive: boolean; emailVerifiedAt: Date | null;
  verificationRequiredAt: Date | null;
}>;
export type DryRunActivationToken = Readonly<{
  id: number; userId: number; emailSnapshot: string; tokenHash: string;
  createdAt: Date; expiresAt: Date; consumedAt: Date | null;
  revokedAt: Date | null;
}>;
export type DryRunActivationOutbox = Readonly<{
  id: number; verificationTokenId: number; idempotencyKey: string;
  state: string; claimId: string | null; attemptCount: number;
  createdAt: Date; claimedAt: Date | null; expiresAt: Date;
  finalizedAt: Date | null; providerMessageId: string | null;
  payloadCiphertext: string; payloadNonce: string;
  payloadKeyId: string; payloadDigest: string;
}>;
export type DryRunSnapshot = Readonly<{
  account: DryRunActivationAccount;
  token: DryRunActivationToken;
  outbox: DryRunActivationOutbox;
}>;
export type DryRunPreflight = Readonly<{
  /** Neither outcome permits delivery. No recipient/token/ciphertext is returned. */
  status: "eligible_snapshot" | "blocked";
  sendAuthorized: false;
}>;

const BLOCKED: DryRunPreflight = Object.freeze({ status: "blocked", sendAuthorized: false });
const ELIGIBLE: DryRunPreflight = Object.freeze({ status: "eligible_snapshot", sendAuthorized: false });
const HASH = /^[a-f0-9]{64}$/;
const KEY = /^[A-Za-z0-9_-]{32}$/;
const IDEM = /^[A-Za-z0-9_-]{32}$/;
const MAX_ID = 2147483647;
function intId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_ID;
}
function ms(value: unknown): number {
  return value instanceof Date ? value.getTime() : NaN;
}
function canonical24(value: unknown): value is string {
  if (typeof value !== "string" || !KEY.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === 24 && decoded.toString("base64url") === value;
}
function sameHash(a: string, b: string): boolean {
  if (!HASH.test(a) || !HASH.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * Simulate preflight with pinned trusted row snapshots and synthetic/offline keys.
 * Caller MUST NOT treat eligible_snapshot as permission to send an email.
 */
export function preflightClaimedActivationMailDryRun(input: Readonly<{
  snapshot: DryRunSnapshot;
  claimId: string;
  expectedPublicOrigin: string;
  operatorDryRunEnabled: boolean;
  keys: ReadonlyMap<string, Uint8Array>;
  now: Date;
}>): DryRunPreflight {
  // Fail closed, including malformed/missing objects. No errors with PII.
  try {
    if (!input || input.operatorDryRunEnabled !== true || !(input.keys instanceof Map)) return BLOCKED;
    const { account, token, outbox } = input.snapshot ?? {} as DryRunSnapshot;
    if (!account || !token || !outbox || !intId(account.id) || !intId(token.id) ||
        !intId(token.userId) || !intId(outbox.id) || !intId(outbox.verificationTokenId)) return BLOCKED;
    const nowMs = ms(input.now), expiresMs = ms(token.expiresAt);
    const issuedMs = ms(token.createdAt), createdMs = ms(outbox.createdAt);
    const claimedMs = ms(outbox.claimedAt);
    if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs) ||
        !Number.isFinite(issuedMs) || !Number.isFinite(createdMs) ||
        !Number.isFinite(claimedMs) || issuedMs > claimedMs ||
        createdMs > claimedMs || claimedMs > nowMs ||
        expiresMs - nowMs <= 60_000 || expiresMs - nowMs > 30 * 60_000) return BLOCKED;
    if (outbox.state !== "in_flight" || outbox.attemptCount !== 1 ||
        outbox.finalizedAt !== null || outbox.providerMessageId !== null ||
        token.consumedAt !== null || token.revokedAt !== null ||
        token.userId !== account.id || token.id !== outbox.verificationTokenId ||
        token.emailSnapshot !== account.email ||
        ms(outbox.expiresAt) !== expiresMs ||
        !canIssueEmailVerification(account) || !needsSecurePendingActivation(account)) return BLOCKED;
    if (!canonical24(input.claimId) || !canonical24(outbox.claimId) ||
        input.claimId !== outbox.claimId || typeof outbox.idempotencyKey !== "string" ||
        !IDEM.test(outbox.idempotencyKey) || !canonical24(outbox.idempotencyKey)) return BLOCKED;
    const origin = canonicalActivationMailOrigin(input.expectedPublicOrigin);
    if (!origin) return BLOCKED;
    const plaintext = unsealActivationMailOutboxPayload({
      payloadCiphertext: outbox.payloadCiphertext,
      payloadNonce: outbox.payloadNonce,
      payloadKeyId: outbox.payloadKeyId,
      payloadDigest: outbox.payloadDigest,
    }, {
      verificationTokenId: token.id,
      idempotencyKey: outbox.idempotencyKey,
      expiresAt: token.expiresAt,
    }, input.keys, input.now);
    if (!plaintext || plaintext.email !== account.email || plaintext.publicOrigin !== origin ||
        !sameHash(token.tokenHash, hashEmailVerificationToken(plaintext.token) ?? "")) return BLOCKED;
    // Build only as an additional validation. Do not return the plaintext/mail.
    if (!buildPendingActivationMail(plaintext, input.now)) return BLOCKED;
    return ELIGIBLE;
  } catch {
    return BLOCKED;
  }
}
