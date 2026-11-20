/**
 * AUTH-01 / R1C2C2: INTERNAL, INERT recovery dispatch fence.
 * No mail, provider, worker, HTTP, secret loader, retry or network capability.
 * The durable fence is a one-time marker, NEVER authorization for external IO.
 *
 * Lock order USER -> TOKEN -> OUTBOX. A revoke/consume committed before these
 * locks blocks a new fence. A revoke AFTER fence commit is still possible;
 * PostgreSQL cannot make future provider calls atomic with a token revoke.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetMailOutbox, passwordResetTokens, users } from "@/db/schema";
import { preflightClaimedPasswordResetMailDryRun } from "./password-reset-request-outbox-preflight";

type FenceResult = Readonly<
  | { ok: true; fenceRecorded: true; sendAuthorized: false }
  | { ok: false; kind: "blocked"; sendAuthorized: false }
>;
const BLOCKED: FenceResult = Object.freeze({ ok: false, kind: "blocked", sendAuthorized: false });
const RECORDED: FenceResult = Object.freeze({ ok: true, fenceRecorded: true, sendAuthorized: false });
const MAX_ID = 2147483647;
const CLAIM = /^[A-Za-z0-9_-]{32}$/;

function isCanonicalClaimId(value: unknown): value is string {
  if (typeof value !== "string" || !CLAIM.test(value)) return false;
  const raw = Buffer.from(value, "base64url");
  return raw.length === 24 && raw.toString("base64url") === value;
}

/**
 * operatorFenceEnabled is an explicit INTERNAL opt-in for *recording a marker*
 * only. It is NOT an operator-controlled database gate or permission to send.
 * A later stage must implement a persisted OFF-by-default operator gate.
 */
export async function recordPendingRecoveryDispatchFenceOnce(input: Readonly<{
  outboxId: number;
  claimId: string;
  expectedPublicOrigin: string;
  operatorFenceEnabled: boolean;
  keys: ReadonlyMap<string, Uint8Array>;
}>): Promise<FenceResult> {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== 5 ||
      !Number.isSafeInteger(input.outboxId) || input.outboxId <= 0 || input.outboxId > MAX_ID ||
      !isCanonicalClaimId(input.claimId) || typeof input.expectedPublicOrigin !== "string" ||
      input.operatorFenceEnabled !== true || !(input.keys instanceof Map)) return BLOCKED;

  // Advisory lookup only; NEVER authorize a fence based on an unlocked read.
  const [candidate] = await db.select({
    userId: passwordResetTokens.userId,
    tokenId: passwordResetTokens.id,
  }).from(passwordResetMailOutbox)
    .innerJoin(passwordResetTokens, eq(passwordResetMailOutbox.passwordResetTokenId, passwordResetTokens.id))
    .where(eq(passwordResetMailOutbox.id, input.outboxId)).limit(1);
  if (!candidate) return BLOCKED;

  return db.transaction(async (tx): Promise<FenceResult> => {
    const [account] = await tx.select({
      id: users.id, email: users.email, passwordHash: users.passwordHash,
      isActive: users.isActive, emailVerifiedAt: users.emailVerifiedAt,
    }).from(users).where(eq(users.id, candidate.userId)).limit(1).for("update");

    const [token] = await tx.select({
      id: passwordResetTokens.id, userId: passwordResetTokens.userId,
      tokenHash: passwordResetTokens.tokenHash,
      createdAt: passwordResetTokens.createdAt, expiresAt: passwordResetTokens.expiresAt,
      consumedAt: passwordResetTokens.consumedAt, revokedAt: passwordResetTokens.revokedAt,
    }).from(passwordResetTokens)
      .where(eq(passwordResetTokens.id, candidate.tokenId)).limit(1).for("update");

    const [outbox] = await tx.select({
      id: passwordResetMailOutbox.id,
      passwordResetTokenId: passwordResetMailOutbox.passwordResetTokenId,
      idempotencyKey: passwordResetMailOutbox.idempotencyKey,
      state: passwordResetMailOutbox.state,
      claimId: passwordResetMailOutbox.claimId,
      attemptCount: passwordResetMailOutbox.attemptCount,
      createdAt: passwordResetMailOutbox.createdAt,
      claimedAt: passwordResetMailOutbox.claimedAt,
      expiresAt: passwordResetMailOutbox.expiresAt,
      finalizedAt: passwordResetMailOutbox.finalizedAt,
      payloadCiphertext: passwordResetMailOutbox.payloadCiphertext,
      payloadNonce: passwordResetMailOutbox.payloadNonce,
      payloadKeyId: passwordResetMailOutbox.payloadKeyId,
      payloadDigest: passwordResetMailOutbox.payloadDigest,
      dispatchFenceAt: passwordResetMailOutbox.dispatchFenceAt,
    }).from(passwordResetMailOutbox)
      .where(eq(passwordResetMailOutbox.id, input.outboxId)).limit(1).for("update");

    if (!account || !token || !outbox ||
        account.id !== candidate.userId || token.userId !== account.id ||
        token.id !== candidate.tokenId || outbox.passwordResetTokenId !== token.id ||
        outbox.claimId !== input.claimId || outbox.dispatchFenceAt !== null) return BLOCKED;

    const now = new Date(); // Only after all three locks are acquired.
    const result = preflightClaimedPasswordResetMailDryRun({
      snapshot: { account, token, outbox },
      claimId: input.claimId,
      expectedPublicOrigin: input.expectedPublicOrigin,
      operatorDryRunEnabled: input.operatorFenceEnabled,
      keys: input.keys,
      now,
    });
    if (result.status !== "eligible_snapshot" || result.sendAuthorized !== false) return BLOCKED;

    const changed = await tx.update(passwordResetMailOutbox).set({
      dispatchFenceAt: now, updatedAt: now,
    }).where(and(
      eq(passwordResetMailOutbox.id, outbox.id),
      eq(passwordResetMailOutbox.passwordResetTokenId, token.id),
      eq(passwordResetMailOutbox.state, "in_flight"),
      eq(passwordResetMailOutbox.claimId, input.claimId),
      isNull(passwordResetMailOutbox.dispatchFenceAt),
    )).returning({ id: passwordResetMailOutbox.id });
    return changed.length === 1 ? RECORDED : BLOCKED;
  });
}
