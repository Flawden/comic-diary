/**
 * AUTH-01 / R1B2B: INTERNAL ONLY — atomic password-recovery token + encrypted
 * outbox issuance. This function is NOT wired to HTTP or a mail sender.
 *
 * The user ID must come from an already authorised, rate-limited internal
 * caller; the publicOrigin must come from trusted deployment configuration.
 * No raw recovery token leaves this transaction result or reaches a DB field.
 */
import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { passwordResetMailOutbox, passwordResetTokens, users } from "@/db/schema";
import { canQueuePasswordResetForAccount } from "./password-reset-request-policy";
import { canonicalPasswordResetMailOrigin } from "./password-reset-request-mail";
import {
  sealPasswordResetMailOutboxPayload,
  type PasswordResetMailOutboxKey,
} from "./password-reset-request-outbox-crypto";
import { issuePasswordResetToken } from "./password-reset-token";

export type PasswordResetMailEnqueueResult =
  | { ok: true; queued: true }
  | { ok: false; kind: "account_unavailable" | "invalid_origin" };

/**
 * Lock order: USER -> revoke old TOKEN -> expire old READY outbox -> insert
 * TOKEN -> seal envelope -> insert OUTBOX. A single transaction encompasses
 * every step: any failed seal/insert THROWS so revoked old credentials are
 * rolled back too, instead of being accidentally committed.
 *
 * A later sender MUST recheck token, mailbox, expiry and dispatch permission
 * under the approved locking protocol. No sender exists in this stage.
 */
export async function enqueuePasswordResetMailForUser(input: Readonly<{
  userId: number;
  publicOrigin: string;
  key: PasswordResetMailOutboxKey;
}>): Promise<PasswordResetMailEnqueueResult> {
  if (!input || !Number.isSafeInteger(input.userId) || input.userId <= 0 ||
      input.userId > 2147483647) {
    return { ok: false, kind: "account_unavailable" };
  }

  // NEVER derive the public origin from Host or X-Forwarded-* headers.
  const origin = canonicalPasswordResetMailOrigin(input.publicOrigin);
  if (!origin) return { ok: false, kind: "invalid_origin" };

  return db.transaction(async (tx): Promise<PasswordResetMailEnqueueResult> => {
    const rows = await tx.select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      emailVerifiedAt: users.emailVerifiedAt,
      isActive: users.isActive,
    }).from(users).where(eq(users.id, input.userId)).limit(1).for("update");
    const account = rows[0];
    if (!account || !canQueuePasswordResetForAccount(account, account.email)) {
      return { ok: false, kind: "account_unavailable" };
    }

    // Calculate issuance time only after the user-row lock is held.
    const now = new Date();
    const issued = issuePasswordResetToken(now);

    const revoked = await tx.update(passwordResetTokens)
      .set({ revokedAt: now })
      .where(and(
        eq(passwordResetTokens.userId, account.id),
        isNull(passwordResetTokens.consumedAt),
        isNull(passwordResetTokens.revokedAt),
      ))
      .returning({ id: passwordResetTokens.id });

    // Expire only UNSENT messages attached to revoked recovery challenges.
    if (revoked.length > 0) {
      await tx.update(passwordResetMailOutbox)
        .set({ state: "expired", finalizedAt: now, updatedAt: now })
        .where(and(
          inArray(passwordResetMailOutbox.passwordResetTokenId, revoked.map((row) => row.id)),
          eq(passwordResetMailOutbox.state, "ready"),
        ));
    }

    const saved = await tx.insert(passwordResetTokens).values({
      userId: account.id,
      tokenHash: issued.tokenHash,
      expiresAt: issued.expiresAt,
      createdAt: now,
    }).returning({ id: passwordResetTokens.id });
    const passwordResetTokenId = saved[0]?.id;
    if (!passwordResetTokenId) throw new Error("Recovery token insertion aborted");

    const idempotencyKey = randomBytes(24).toString("base64url");
    const envelope = sealPasswordResetMailOutboxPayload(
      {
        // Recipient is read exclusively from the locked, verified user row.
        email: account.email,
        token: issued.token,
        publicOrigin: origin,
        expiresAt: issued.expiresAt,
      },
      { passwordResetTokenId, idempotencyKey, expiresAt: issued.expiresAt },
      input.key,
      now,
    );
    // Return of {ok:false} would COMMIT prior revocations/insertion. THROW.
    if (!envelope) throw new Error("Recovery mail encryption aborted");

    const queued = await tx.insert(passwordResetMailOutbox).values({
      passwordResetTokenId,
      payloadCiphertext: envelope.payloadCiphertext,
      payloadNonce: envelope.payloadNonce,
      payloadKeyId: envelope.payloadKeyId,
      payloadDigest: envelope.payloadDigest,
      idempotencyKey,
      expiresAt: issued.expiresAt,
      createdAt: now,
      updatedAt: now,
    }).returning({ id: passwordResetMailOutbox.id });
    if (!queued[0]) throw new Error("Recovery mail outbox insertion aborted");

    return { ok: true, queued: true };
  });
}
