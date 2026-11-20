/**
 * AUTH-01C2B4D2C4B3B2: INTERNAL DATABASE FENCE ONLY.
 *
 * This records an at-most-once durable marker for a previously claimed row.
 * It does NOT return a message, decrypt for the caller, grant send permission,
 * connect to an email provider, schedule retries, or authorize network IO.
 *
 * Atomicity guarantee A: a completed revoke/consume (using the same USER lock)
 * precedes and blocks a new fence transaction. If the fence commits first,
 * a later revoke is still possible. External HTTP start is NOT atomic with PG;
 * strict guarantee B (no provider start after revoke) is not established here.
 *
 * Trusted internal callers only. No public route, worker, env or keys loaded.
 */
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { activationMailOutbox, emailVerificationTokens, users } from "@/db/schema";
import { preflightClaimedActivationMailDryRun } from "./registration-activation-outbox-dry-run";

type FenceRecorded = Readonly<{
  ok: true; fenceRecorded: true; sendAuthorized: false;
}>;
type FenceBlocked = Readonly<{
  ok: false; kind: "blocked"; sendAuthorized: false;
}>;
export type RecordPendingActivationDispatchFenceResult = FenceRecorded | FenceBlocked;

const BLOCKED: FenceBlocked = Object.freeze({ ok: false, kind: "blocked", sendAuthorized: false });
const RECORDED: FenceRecorded = Object.freeze({ ok: true, fenceRecorded: true, sendAuthorized: false });
const MAX_ID = 2147483647;
const CLAIM = /^[A-Za-z0-9_-]{32}$/;

function canonicalClaimId(value: unknown): value is string {
  if (typeof value !== "string" || !CLAIM.test(value)) return false;
  const raw = Buffer.from(value, "base64url");
  return raw.length === 24 && raw.toString("base64url") === value;
}

/**
 * Never interpret RECORDED as authorization to contact a provider.
 * 'operatorFenceEnabled' is an explicit INTERNAL opt-in for DB fence recording
 * only, and is false/blocked unless it is exactly true. It is not a remotely
 * coordinated operator kill switch for any future transport integration.
 *
 * Everything (account, token, outbox, encrypted payload) is re-read under
 * locks USER -> TOKEN -> OUTBOX; the discovery query is never authorization.
 * The existing no-IO B1 preflight validates the locked snapshots and AEAD
 * with supplied ephemeral keys. Nothing secret escapes this function.
 */
export async function recordPendingActivationDispatchFenceOnce(input: Readonly<{
  outboxId: number;
  claimId: string;
  expectedPublicOrigin: string;
  operatorFenceEnabled: boolean;
  keys: ReadonlyMap<string, Uint8Array>;
}>): Promise<RecordPendingActivationDispatchFenceResult> {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== 5 ||
      !Number.isSafeInteger(input.outboxId) || input.outboxId <= 0 ||
      input.outboxId > MAX_ID || !canonicalClaimId(input.claimId) ||
      typeof input.expectedPublicOrigin !== "string" ||
      input.operatorFenceEnabled !== true || !(input.keys instanceof Map)) return BLOCKED;

  // Advisory discovery ONLY: no locks, no permission, no raw email/token.
  const [candidate] = await db.select({
    userId: emailVerificationTokens.userId,
    tokenId: emailVerificationTokens.id,
  }).from(activationMailOutbox)
    .innerJoin(emailVerificationTokens, eq(activationMailOutbox.verificationTokenId, emailVerificationTokens.id))
    .where(eq(activationMailOutbox.id, input.outboxId)).limit(1);
  if (!candidate) return BLOCKED;

  return db.transaction(async (tx): Promise<RecordPendingActivationDispatchFenceResult> => {
    const [account] = await tx.select({
      id: users.id, email: users.email, passwordHash: users.passwordHash,
      isActive: users.isActive, emailVerifiedAt: users.emailVerifiedAt,
      verificationRequiredAt: users.verificationRequiredAt,
    }).from(users).where(eq(users.id, candidate.userId)).limit(1).for("update");

    const [token] = await tx.select({
      id: emailVerificationTokens.id, userId: emailVerificationTokens.userId,
      emailSnapshot: emailVerificationTokens.emailSnapshot,
        purpose: emailVerificationTokens.purpose,
      tokenHash: emailVerificationTokens.tokenHash,
      createdAt: emailVerificationTokens.createdAt,
      expiresAt: emailVerificationTokens.expiresAt,
      consumedAt: emailVerificationTokens.consumedAt,
      revokedAt: emailVerificationTokens.revokedAt,
    }).from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.id, candidate.tokenId)).limit(1).for("update");

    const [outbox] = await tx.select({
      id: activationMailOutbox.id,
      verificationTokenId: activationMailOutbox.verificationTokenId,
      idempotencyKey: activationMailOutbox.idempotencyKey,
      state: activationMailOutbox.state,
      claimId: activationMailOutbox.claimId,
      attemptCount: activationMailOutbox.attemptCount,
      createdAt: activationMailOutbox.createdAt,
      claimedAt: activationMailOutbox.claimedAt,
      expiresAt: activationMailOutbox.expiresAt,
      finalizedAt: activationMailOutbox.finalizedAt,
      providerMessageId: activationMailOutbox.providerMessageId,
      payloadCiphertext: activationMailOutbox.payloadCiphertext,
      payloadNonce: activationMailOutbox.payloadNonce,
      payloadKeyId: activationMailOutbox.payloadKeyId,
      payloadDigest: activationMailOutbox.payloadDigest,
      dispatchFenceAt: activationMailOutbox.dispatchFenceAt,
    }).from(activationMailOutbox)
      .where(eq(activationMailOutbox.id, input.outboxId)).limit(1).for("update");

    if (!account || !token || !outbox ||
        account.id !== candidate.userId || token.userId !== account.id ||
        token.id !== candidate.tokenId || outbox.dispatchFenceAt !== null ||
        outbox.claimId !== input.claimId) return BLOCKED;

    const now = new Date(); // Clock sampled AFTER all three locks.
    const preflight = preflightClaimedActivationMailDryRun({
      snapshot: { account, token, outbox },
      claimId: input.claimId,
      expectedPublicOrigin: input.expectedPublicOrigin,
      operatorDryRunEnabled: input.operatorFenceEnabled,
      keys: input.keys,
      now,
    });
    if (preflight.status !== "eligible_snapshot" || preflight.sendAuthorized !== false) {
      return BLOCKED;
    }

    const changed = await tx.update(activationMailOutbox).set({
      dispatchFenceAt: now,
      updatedAt: now,
    }).where(and(
      eq(activationMailOutbox.id, outbox.id),
      eq(activationMailOutbox.verificationTokenId, token.id),
      eq(activationMailOutbox.state, "in_flight"),
      eq(activationMailOutbox.claimId, input.claimId),
      isNull(activationMailOutbox.dispatchFenceAt),
    )).returning({ id: activationMailOutbox.id });
    return changed.length === 1 ? RECORDED : BLOCKED;
  });
}
