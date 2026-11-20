/**
 * AUTH-01 / R1C2C3: INTERNAL, INERT, one-shot recovery dispatch reservation.
 * NO mail, HTTP, provider, worker, schedule, secret loader, operator ON route.
 * A reservation, even if successful, NEVER authorizes a provider call.
 * Lock order for future operator transitions: CONTROL -> USER -> TOKEN -> OUTBOX.
 * OFF blocks only NEW reservations after it commits; an earlier reservation
 * cannot be revoked retroactively, nor can SQL make future network IO atomic.
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  passwordResetMailDispatchControl,
  passwordResetMailOutbox,
  passwordResetTokens,
  users,
} from "@/db/schema";
import { preflightClaimedPasswordResetMailDryRun } from "./password-reset-request-outbox-preflight";

export type RecoveryReservationResult = Readonly<
  | { ok: true; reserved: true; sendAuthorized: false }
  | { ok: false; kind: "blocked"; sendAuthorized: false }
>;
const BLOCKED: RecoveryReservationResult = Object.freeze({ ok: false, kind: "blocked", sendAuthorized: false });
const RESERVED: RecoveryReservationResult = Object.freeze({ ok: true, reserved: true, sendAuthorized: false });
const CLAIM = /^[A-Za-z0-9_-]{32}$/;
function isClaimId(value: unknown): value is string {
  if (typeof value !== "string" || !CLAIM.test(value)) return false;
  const bytes = Buffer.from(value, "base64url");
  return bytes.length === 24 && bytes.toString("base64url") === value;
}

/** No operatorEnabled boolean, only an actual locked, durable control row. */
export async function reservePendingRecoveryDispatchOnce(input: Readonly<{
  outboxId: number;
  claimId: string;
  expectedPublicOrigin: string;
  keys: ReadonlyMap<string, Uint8Array>;
}>): Promise<RecoveryReservationResult> {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== 4 ||
      !Number.isSafeInteger(input.outboxId) || input.outboxId <= 0 || input.outboxId > 2147483647 ||
      !isClaimId(input.claimId) || typeof input.expectedPublicOrigin !== "string" ||
      !(input.keys instanceof Map)) return BLOCKED;

  // Advisory lookup ONLY: validation happens again after all row locks.
  const [candidate] = await db.select({
    userId: passwordResetTokens.userId,
    tokenId: passwordResetTokens.id,
  }).from(passwordResetMailOutbox)
    .innerJoin(passwordResetTokens, eq(passwordResetMailOutbox.passwordResetTokenId, passwordResetTokens.id))
    .where(eq(passwordResetMailOutbox.id, input.outboxId)).limit(1);
  if (!candidate) return BLOCKED;

  return db.transaction(async (tx): Promise<RecoveryReservationResult> => {
    const [control] = await tx.select({
      enabled: passwordResetMailDispatchControl.enabled,
      generation: passwordResetMailDispatchControl.generation,
    }).from(passwordResetMailDispatchControl)
      .where(eq(passwordResetMailDispatchControl.id, 1)).limit(1).for("update");
    if (!control || control.enabled !== true ||
        !Number.isSafeInteger(control.generation) ||
        control.generation <= 0 || control.generation >= 2147483647) return BLOCKED;

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
      dispatchReservationAt: passwordResetMailOutbox.dispatchReservationAt,
      dispatchReservationGeneration: passwordResetMailOutbox.dispatchReservationGeneration,
    }).from(passwordResetMailOutbox)
      .where(eq(passwordResetMailOutbox.id, input.outboxId)).limit(1).for("update");

    if (!account || !token || !outbox ||
        account.id !== candidate.userId || token.userId !== account.id ||
        token.id !== candidate.tokenId || outbox.passwordResetTokenId !== token.id ||
        outbox.claimId !== input.claimId || outbox.dispatchFenceAt === null ||
        outbox.dispatchReservationAt !== null ||
        outbox.dispatchReservationGeneration !== null) return BLOCKED;

    const now = new Date(); // Taken only after control, user, token and outbox locks.
    const preflight = preflightClaimedPasswordResetMailDryRun({
      snapshot: { account, token, outbox },
      claimId: input.claimId,
      expectedPublicOrigin: input.expectedPublicOrigin,
      operatorDryRunEnabled: control.enabled,
      keys: input.keys,
      now,
    });
    if (preflight.status !== "eligible_snapshot" || preflight.sendAuthorized !== false ||
        outbox.dispatchFenceAt.getTime() > now.getTime()) return BLOCKED;

    const updated = await tx.update(passwordResetMailOutbox).set({
      dispatchReservationAt: now,
      dispatchReservationGeneration: control.generation,
      updatedAt: now,
    }).where(and(
      eq(passwordResetMailOutbox.id, outbox.id),
      eq(passwordResetMailOutbox.passwordResetTokenId, token.id),
      eq(passwordResetMailOutbox.state, "in_flight"),
      eq(passwordResetMailOutbox.claimId, input.claimId),
      isNotNull(passwordResetMailOutbox.dispatchFenceAt),
      isNull(passwordResetMailOutbox.dispatchReservationAt),
      isNull(passwordResetMailOutbox.dispatchReservationGeneration),
    )).returning({ id: passwordResetMailOutbox.id });
    return updated.length === 1 ? RESERVED : BLOCKED;
  });
}
