/**
 * AUTH-01C2B4D2C4B3B3B — INTERNAL OPERATOR-GATED RESERVATION ONLY.
 *
 * This function does not grant email/HTTP permission. It holds a single
 * shared control row lock first, then USER -> TOKEN -> OUTBOX. A committed
 * disable before this transaction acquires the control lock blocks a NEW
 * durable reservation. A disable after commit cannot revoke a past marker
 * alone. The integrated dispatcher rechecks the gate at committed start.
 * Reservation alone retains NO guarantee B.
 *
 * The control row is default OFF. This module provides NO enable endpoint,
 * scheduler, sender, key loader, environment switch or provider adapter.
 * A failed/missing control row, key, origin, claim or AEAD check fails closed.
 * Reservation is irreversible; do not requeue an ambiguous attempt.
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/db";
import { activationMailDispatchControl, activationMailOutbox, emailVerificationTokens, users } from "@/db/schema";
import { preflightClaimedActivationMailDryRun } from "./registration-activation-outbox-dry-run";

export type ReservePendingActivationDispatchResult = Readonly<
  | { ok: true; reserved: true; sendAuthorized: false }
  | { ok: false; kind: "blocked"; sendAuthorized: false }
>;

const BLOCKED: ReservePendingActivationDispatchResult = Object.freeze({ ok: false, kind: "blocked", sendAuthorized: false });
const RESERVED: ReservePendingActivationDispatchResult = Object.freeze({ ok: true, reserved: true, sendAuthorized: false });
const CLAIM = /^[A-Za-z0-9_-]{32}$/;

function isClaimId(value: unknown): value is string {
  if (typeof value !== "string" || !CLAIM.test(value)) return false;
  const raw = Buffer.from(value, "base64url");
  return raw.length === 24 && raw.toString("base64url") === value;
}

/**
 * No caller-supplied operatorEnabled boolean: only the locked persisted row
 * can allow a reservation. Returned `reserved` is NOT a network capability.
 */
export async function reservePendingActivationDispatchOnce(input: Readonly<{
  outboxId: number;
  claimId: string;
  expectedPublicOrigin: string;
  keys: ReadonlyMap<string, Uint8Array>;
}>): Promise<ReservePendingActivationDispatchResult> {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== 4 ||
      !Number.isSafeInteger(input.outboxId) || input.outboxId <= 0 || input.outboxId > 2147483647 ||
      !isClaimId(input.claimId) || typeof input.expectedPublicOrigin !== "string" ||
      !(input.keys instanceof Map)) return BLOCKED;

  // Advisory discovery only: never decide eligibility on this unlocked read.
  const [candidate] = await db.select({
    userId: emailVerificationTokens.userId,
    tokenId: emailVerificationTokens.id,
  }).from(activationMailOutbox)
    .innerJoin(emailVerificationTokens, eq(activationMailOutbox.verificationTokenId, emailVerificationTokens.id))
    .where(eq(activationMailOutbox.id, input.outboxId)).limit(1);
  if (!candidate) return BLOCKED;

  return db.transaction(async (tx): Promise<ReservePendingActivationDispatchResult> => {
    // GLOBAL CONTROL is locked first and held until COMMIT (or rollback).
    // All future enable/disable updates must serialize against this same row.
    const [control] = await tx.select({
      enabled: activationMailDispatchControl.enabled,
      generation: activationMailDispatchControl.generation,
    }).from(activationMailDispatchControl)
      .where(eq(activationMailDispatchControl.id, 1)).limit(1).for("share");
    if (!control || control.enabled !== true ||
        !Number.isSafeInteger(control.generation) || control.generation <= 0) return BLOCKED;

    const [account] = await tx.select({
      id: users.id, email: users.email, passwordHash: users.passwordHash,
      isActive: users.isActive, emailVerifiedAt: users.emailVerifiedAt,
      verificationRequiredAt: users.verificationRequiredAt,
    }).from(users).where(eq(users.id, candidate.userId)).limit(1).for("update");

    const [token] = await tx.select({
      id: emailVerificationTokens.id, userId: emailVerificationTokens.userId,
      emailSnapshot: emailVerificationTokens.emailSnapshot,
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
      dispatchReservationAt: activationMailOutbox.dispatchReservationAt,
      dispatchReservationGeneration: activationMailOutbox.dispatchReservationGeneration,
    }).from(activationMailOutbox)
      .where(eq(activationMailOutbox.id, input.outboxId)).limit(1).for("update");

    if (!account || !token || !outbox ||
        account.id !== candidate.userId || token.userId !== account.id ||
        token.id !== candidate.tokenId || outbox.verificationTokenId !== token.id ||
        outbox.claimId !== input.claimId || outbox.dispatchFenceAt === null ||
        outbox.dispatchReservationAt !== null || outbox.dispatchReservationGeneration !== null) return BLOCKED;

    const now = new Date(); // sampled after ALL locks, never from user input.
    const preflight = preflightClaimedActivationMailDryRun({
      snapshot: { account, token, outbox },
      claimId: input.claimId,
      expectedPublicOrigin: input.expectedPublicOrigin,
      operatorDryRunEnabled: control.enabled,
      keys: input.keys,
      now,
    });
    if (preflight.status !== "eligible_snapshot" || preflight.sendAuthorized !== false ||
        outbox.dispatchFenceAt.getTime() > now.getTime()) return BLOCKED;

    const updated = await tx.update(activationMailOutbox).set({
      dispatchReservationAt: now,
      dispatchReservationGeneration: control.generation,
      updatedAt: now,
    }).where(and(
      eq(activationMailOutbox.id, outbox.id),
      eq(activationMailOutbox.verificationTokenId, token.id),
      eq(activationMailOutbox.state, "in_flight"),
      eq(activationMailOutbox.claimId, input.claimId),
      isNotNull(activationMailOutbox.dispatchFenceAt),
      isNull(activationMailOutbox.dispatchReservationAt),
      isNull(activationMailOutbox.dispatchReservationGeneration),
    )).returning({ id: activationMailOutbox.id });
    return updated.length === 1 ? RESERVED : BLOCKED;
  });
}
