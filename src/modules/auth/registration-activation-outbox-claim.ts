/**
 * AUTH-01C2B4D2C4A: INTERNAL ONLY — transactionally claim/finalize an
 * encrypted pending-activation outbox entry. This module performs NO delivery,
 * HTTP calls, decryption, key loading, automatic retry, or scheduler activity.
 *
 * Lock order is USER -> TOKEN -> OUTBOX, matching D2C3 issuance. Candidate
 * discovery is advisory only: every authorization and state predicate is
 * rechecked AFTER all row locks have been acquired.
 *
 * Important: a durable `in_flight` claim can have an ambiguous external
 * outcome. NEVER recycle it into `ready`, even if the process has crashed.
 */
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { activationMailOutbox, emailVerificationTokens, users } from "@/db/schema";
import { canIssueEmailVerification } from "./email-verification-policy";
import { needsSecurePendingActivation } from "./registration-activation-policy";
import { deriveActivationOutboxNextState } from "./registration-activation-outbox-policy";

type Claimed = Readonly<{ ok: true; outboxId: number; claimId: string }>;
type NoWork = Readonly<{ ok: false; kind: "no_work" }>;
export type ClaimPendingActivationMailResult = Claimed | NoWork;

/**
 * Claim at most ONE eligible entry. No plaintext/token/ciphertext is returned.
 * A future dispatcher must separately validate and decrypt under its own
 * explicit trust boundary, and revalidate token/account immediately before
 * attempting delivery. This method DOES NOT authorize sending.
 */
export async function claimPendingActivationMailOnce(): Promise<ClaimPendingActivationMailResult> {
  const candidates = await db.select({
    outboxId: activationMailOutbox.id,
    tokenId: emailVerificationTokens.id,
    userId: emailVerificationTokens.userId,
  }).from(activationMailOutbox)
    .innerJoin(emailVerificationTokens, eq(activationMailOutbox.verificationTokenId, emailVerificationTokens.id))
    .where(eq(activationMailOutbox.state, "ready"))
    .orderBy(activationMailOutbox.expiresAt, activationMailOutbox.id)
    .limit(16);

  for (const candidate of candidates) {
    const result = await db.transaction(async (tx): Promise<Claimed | null> => {
      const [account] = await tx.select({
        id: users.id, email: users.email, passwordHash: users.passwordHash,
        isActive: users.isActive, emailVerifiedAt: users.emailVerifiedAt,
        verificationRequiredAt: users.verificationRequiredAt,
      }).from(users).where(eq(users.id, candidate.userId)).limit(1).for("update");

      const [token] = await tx.select({
        id: emailVerificationTokens.id, userId: emailVerificationTokens.userId,
        emailSnapshot: emailVerificationTokens.emailSnapshot,
        expiresAt: emailVerificationTokens.expiresAt,
        consumedAt: emailVerificationTokens.consumedAt,
        revokedAt: emailVerificationTokens.revokedAt,
      }).from(emailVerificationTokens)
        .where(eq(emailVerificationTokens.id, candidate.tokenId)).limit(1).for("update");

      const [item] = await tx.select({
        id: activationMailOutbox.id, state: activationMailOutbox.state,
        verificationTokenId: activationMailOutbox.verificationTokenId,
        expiresAt: activationMailOutbox.expiresAt,
        createdAt: activationMailOutbox.createdAt,
      }).from(activationMailOutbox)
        .where(eq(activationMailOutbox.id, candidate.outboxId)).limit(1).for("update");

      if (!item || item.state !== "ready" || !token || !account) return null;
      const now = new Date(); // AFTER acquiring locks, never from untrusted caller.
      const live = account.id === candidate.userId &&
        token.userId === account.id && token.id === item.verificationTokenId &&
        token.consumedAt === null && token.revokedAt === null &&
        token.emailSnapshot === account.email &&
        needsSecurePendingActivation(account) && canIssueEmailVerification(account) &&
        item.expiresAt.getTime() === token.expiresAt.getTime();
      const next = live ? deriveActivationOutboxNextState("ready", {
        kind: "claimed", now, expiresAt: item.expiresAt,
      }) : null;

      if (next !== "in_flight") {
        // Invalid, revoked and nearly-expired READY entries must not be sent.
        // Never modify IN_FLIGHT or terminal states.
        const finalizedAt = new Date(Math.max(now.getTime(), item.createdAt.getTime()));
        await tx.update(activationMailOutbox).set({
          state: "expired", finalizedAt, updatedAt: finalizedAt,
        }).where(and(eq(activationMailOutbox.id, item.id), eq(activationMailOutbox.state, "ready")));
        return null;
      }
      const claimId = randomBytes(24).toString("base64url");
      const claimed = await tx.update(activationMailOutbox).set({
        state: next, claimId, attemptCount: 1, claimedAt: now, updatedAt: now,
      }).where(and(eq(activationMailOutbox.id, item.id), eq(activationMailOutbox.state, "ready")))
        .returning({ id: activationMailOutbox.id });
      return claimed.length === 1 ? { ok: true, outboxId: claimed[0]!.id, claimId } : null;
    });
    if (result) return result;
  }
  return { ok: false, kind: "no_work" };
}

/**
 * Record a safe terminal provider classification. The caller must hold the
 * unpredictable claimId from a successful durable claim. This is NOT a retry,
 * provider call, delivery receipt, or permission to perform a send.
 */
export async function finalizeClaimedActivationMail(input: Readonly<{
  outboxId: number;
  claimId: string;
  result: "accepted" | "rejected" | "uncertain";
}>): Promise<boolean> {
  if (!input || !Number.isSafeInteger(input.outboxId) || input.outboxId <= 0 ||
      input.outboxId > 2147483647 || typeof input.claimId !== "string" ||
      !/^[A-Za-z0-9_-]{32}$/.test(input.claimId) ||
      (input.result !== "accepted" && input.result !== "rejected" && input.result !== "uncertain") ||
      Object.keys(input).length !== 3) return false;

  // Advisory lookup only; revalidate under matching D2C3 lock order.
  const [candidate] = await db.select({
    tokenId: emailVerificationTokens.id, userId: emailVerificationTokens.userId,
  }).from(activationMailOutbox)
    .innerJoin(emailVerificationTokens, eq(activationMailOutbox.verificationTokenId, emailVerificationTokens.id))
    .where(eq(activationMailOutbox.id, input.outboxId)).limit(1);
  if (!candidate) return false;

  return db.transaction(async (tx): Promise<boolean> => {
    const [account] = await tx.select({ id: users.id }).from(users)
      .where(eq(users.id, candidate.userId)).limit(1).for("update");
    const [token] = await tx.select({ id: emailVerificationTokens.id, userId: emailVerificationTokens.userId })
      .from(emailVerificationTokens).where(eq(emailVerificationTokens.id, candidate.tokenId))
      .limit(1).for("update");
    const [item] = await tx.select({
      id: activationMailOutbox.id, state: activationMailOutbox.state,
      claimId: activationMailOutbox.claimId, createdAt: activationMailOutbox.createdAt,
    }).from(activationMailOutbox).where(eq(activationMailOutbox.id, input.outboxId))
      .limit(1).for("update");
    if (!account || !token || !item || token.userId !== account.id ||
        item.state !== "in_flight" || item.claimId !== input.claimId ||
        deriveActivationOutboxNextState("in_flight", {
          kind: "provider_result", result: input.result,
        }) !== input.result) return false;

    const now = new Date(Math.max(Date.now(), item.createdAt.getTime()));
    const updated = await tx.update(activationMailOutbox).set({
      state: input.result, finalizedAt: now, updatedAt: now,
    }).where(and(
      eq(activationMailOutbox.id, item.id), eq(activationMailOutbox.state, "in_flight"),
      eq(activationMailOutbox.claimId, input.claimId),
    )).returning({ id: activationMailOutbox.id });
    return updated.length === 1;
  });
}
