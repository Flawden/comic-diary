/**
 * AUTH-01 / R1C2B2. INTERNAL exclusive claim only for password recovery outbox.
 * The integrated dispatcher uses this exclusive claim before its locked
 * preflight/reservation/start. This module itself has no mail sending,
 * key loading, envelope decryption or network calls.
 *
 * Strict lock order USER -> TOKEN -> OUTBOX, same as recovery issuance.
 * Candidate enumeration is advisory; every eligibility condition is rechecked
 * AFTER holding all three row locks. A durable in_flight claim is NEVER reset
 * to ready even after process failure; the external outcome may be unknown.
 *
 * IMPORTANT: a claim does NOT authorize delivery. The dispatcher revalidates
 * the AEAD-decrypted recipient, verified mailbox, token epoch and PostgreSQL
 * permission at the final durable start. No claim-only settlement API exists:
 * provider outcomes require the reserved finalizer AND a committed start.
 */
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { passwordResetMailOutbox, passwordResetTokens, users } from "@/db/schema";
import { canQueuePasswordResetForAccount } from "./password-reset-request-policy";
import { deriveRecoveryOutboxNextState } from "./password-reset-request-outbox-policy";

type Claimed = Readonly<{ ok: true; outboxId: number; claimId: string }>;
type NoWork = Readonly<{ ok: false; kind: "no_work" }>;
export type ClaimPendingPasswordResetMailResult = Claimed | NoWork;

/**
 * Atomically claim up to one eligible outbox row. Never returns ciphertext,
 * plaintext, recipient, token hash, token or provider credentials.
 */
export async function claimPendingPasswordResetMailOnce(): Promise<ClaimPendingPasswordResetMailResult> {
  const candidates = await db.select({
    outboxId: passwordResetMailOutbox.id,
    tokenId: passwordResetTokens.id,
    userId: passwordResetTokens.userId,
  }).from(passwordResetMailOutbox)
    .innerJoin(passwordResetTokens, eq(passwordResetMailOutbox.passwordResetTokenId, passwordResetTokens.id))
    .where(eq(passwordResetMailOutbox.state, "ready"))
    .orderBy(passwordResetMailOutbox.expiresAt, passwordResetMailOutbox.id)
    .limit(16);

  for (const candidate of candidates) {
    const result = await db.transaction(async (tx): Promise<Claimed | null> => {
      const [account] = await tx.select({
        id: users.id, email: users.email, passwordHash: users.passwordHash,
        isActive: users.isActive, emailVerifiedAt: users.emailVerifiedAt,
      }).from(users).where(eq(users.id, candidate.userId)).limit(1).for("update");

      const [token] = await tx.select({
        id: passwordResetTokens.id, userId: passwordResetTokens.userId,
        expiresAt: passwordResetTokens.expiresAt,
        consumedAt: passwordResetTokens.consumedAt,
        revokedAt: passwordResetTokens.revokedAt,
        createdAt: passwordResetTokens.createdAt,
      }).from(passwordResetTokens)
        .where(eq(passwordResetTokens.id, candidate.tokenId)).limit(1).for("update");

      const [item] = await tx.select({
        id: passwordResetMailOutbox.id,
        passwordResetTokenId: passwordResetMailOutbox.passwordResetTokenId,
        state: passwordResetMailOutbox.state,
        expiresAt: passwordResetMailOutbox.expiresAt,
        createdAt: passwordResetMailOutbox.createdAt,
      }).from(passwordResetMailOutbox)
        .where(eq(passwordResetMailOutbox.id, candidate.outboxId)).limit(1).for("update");

      if (!item || item.state !== "ready" || !token || !account) return null;
      const now = new Date(Math.max(Date.now(), item.createdAt.getTime(), token.createdAt.getTime()));
      const eligible = account.id === candidate.userId &&
        token.id === candidate.tokenId && token.userId === account.id &&
        item.passwordResetTokenId === token.id &&
        token.consumedAt === null && token.revokedAt === null &&
        canQueuePasswordResetForAccount(account, account.email) &&
        // A mailbox verified AFTER challenge issuance is a different epoch.
        account.emailVerifiedAt !== null && account.emailVerifiedAt.getTime() <= token.createdAt.getTime() &&
        token.expiresAt.getTime() === item.expiresAt.getTime() &&
        token.createdAt.getTime() <= item.createdAt.getTime();
      const next = eligible ? deriveRecoveryOutboxNextState("ready", {
        kind: "claimed", now, expiresAt: item.expiresAt,
      }) : null;

      if (next !== "in_flight") {
        // Revoked/consumed, changed verified mailbox, unavailable account,
        // malformed TTL and nearly expired READY items are never claimed.
        const finalizedAt = new Date(Math.max(now.getTime(), item.createdAt.getTime()));
        await tx.update(passwordResetMailOutbox).set({
          state: "expired", finalizedAt, updatedAt: finalizedAt,
        }).where(and(eq(passwordResetMailOutbox.id, item.id), eq(passwordResetMailOutbox.state, "ready")));
        return null;
      }

      const claimId = randomBytes(24).toString("base64url");
      const claimed = await tx.update(passwordResetMailOutbox).set({
        state: "in_flight", claimId, attemptCount: 1, claimedAt: now, updatedAt: now,
      }).where(and(eq(passwordResetMailOutbox.id, item.id), eq(passwordResetMailOutbox.state, "ready")))
        .returning({ id: passwordResetMailOutbox.id });
      return claimed.length === 1 ? { ok: true, outboxId: claimed[0]!.id, claimId } : null;
    });
    if (result) return result;
  }
  return { ok: false, kind: "no_work" };
}
