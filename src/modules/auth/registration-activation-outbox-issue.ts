/**
 * AUTH-01C2B4D2C3: INTERNAL ONLY — atomically issue a pending account's
 * challenge and store ONE encrypted outbox message in the SAME transaction.
 * The pending wrapper remains strict. The shared transaction kernel also serves
 * session/password-authorized legacy verification with an explicit purpose.
 *
 * Used by atomic registration and trusted reissuance; performs no HTTP.
 * The caller must be trusted and supply the canonical origin + external key;
 * do not expose this function to untrusted request input or public routes.
 */
import { canDispatchVerificationPurpose, type VerificationPurpose } from "./verification-purpose";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { activationMailOutbox, emailVerificationTokens, users } from "@/db/schema";
import { issueEmailVerificationToken } from "./email-verification-token";
import { canonicalActivationMailOrigin } from "./registration-activation-mail";
import {
  sealActivationMailOutboxPayload,
  type ActivationMailOutboxKey,
} from "./registration-activation-outbox-crypto";

export type PendingActivationEnqueueResult =
  | { ok: true; queued: true }
  | { ok: false; kind: "account_unavailable" | "invalid_origin" };

/**
 * Lock order: USER -> TOKEN update -> prior READY outbox update -> new TOKEN
 * -> new OUTBOX. All operations share a single transaction. If AEAD sealing,
 * any insert, or any other step fails, the transaction MUST roll back.
 * The raw token is never returned to the caller, written to a DB column, or
 * passed to any sender. It only enters the temporary AEAD plaintext input.
 *
 * Revoking old challenges also expires only their unsent READY mail. A future
 * worker MUST independently validate token status under the coordinated lock
 * protocol before delivery; in-flight delivery cannot be recalled here.
 */
export async function enqueuePendingActivationMailForUser(input: Readonly<{
  userId: number;
  publicOrigin: string;
  key: ActivationMailOutboxKey;
}>): Promise<PendingActivationEnqueueResult> {
  if (!input || !Number.isSafeInteger(input.userId) || input.userId <= 0 ||
      input.userId > 2147483647) return { ok: false, kind: "account_unavailable" };

  // Never derive the origin from Host or X-Forwarded-Host. Validate before DB IO.
  const origin = canonicalActivationMailOrigin(input.publicOrigin);
  if (!origin) return { ok: false, kind: "invalid_origin" };

  return db.transaction(tx => enqueuePendingActivationMailInTransaction(tx, input));
}

type ActivationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Internal composition point: caller owns rollback and locks CONTROL before USER. */
export async function enqueuePendingActivationMailInTransaction(
  tx: ActivationTransaction,
  input: Readonly<{ userId: number; publicOrigin: string; key: ActivationMailOutboxKey }>,
): Promise<PendingActivationEnqueueResult> {
  return enqueueVerificationMailInTransaction(tx, input, "pending_activation");
}

/** Internal only: caller holds CONTROL -> USER (and SESSION for legacy). */
export async function enqueueVerificationMailInTransaction(
  tx: ActivationTransaction,
  input: Readonly<{ userId: number; publicOrigin: string; key: ActivationMailOutboxKey }>,
  purpose: VerificationPurpose,
): Promise<PendingActivationEnqueueResult> {
  const origin = canonicalActivationMailOrigin(input.publicOrigin);
  if (!origin) throw new Error("Activation origin unavailable");

    const rows = await tx.select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
      emailVerifiedAt: users.emailVerifiedAt,
      verificationRequiredAt: users.verificationRequiredAt,
    }).from(users).where(eq(users.id, input.userId)).limit(1).for("update");
    const account = rows[0];
    if (!account || !canDispatchVerificationPurpose(account, purpose)) {
      return { ok: false, kind: "account_unavailable" };
    }

    const now = new Date(); // AFTER acquiring the account lock.
    const issued = issueEmailVerificationToken(now);

    const revoked = await tx.update(emailVerificationTokens)
      .set({ revokedAt: now })
      .where(and(
        eq(emailVerificationTokens.userId, account.id),
        isNull(emailVerificationTokens.consumedAt),
        isNull(emailVerificationTokens.revokedAt),
      ))
      .returning({ id: emailVerificationTokens.id });

    if (revoked.length !== 0) {
      await tx.update(activationMailOutbox)
        .set({ state: "expired", finalizedAt: now, updatedAt: now })
        .where(and(
          inArray(activationMailOutbox.verificationTokenId, revoked.map((row) => row.id)),
          eq(activationMailOutbox.state, "ready"),
        ));
    }

    const saved = await tx.insert(emailVerificationTokens).values({
      userId: account.id,
      emailSnapshot: account.email, // Exact address from the locked row.
      purpose,
      tokenHash: issued.tokenHash, // NEVER the raw token.
      expiresAt: issued.expiresAt,
      createdAt: now,
    }).returning({ id: emailVerificationTokens.id });
    const verificationTokenId = saved[0]?.id;
    if (!verificationTokenId) throw new Error("Activation-mail issuance aborted");

    const idempotencyKey = randomBytes(24).toString("base64url");
    const envelope = sealActivationMailOutboxPayload(
      { email: account.email, token: issued.token, publicOrigin: origin, expiresAt: issued.expiresAt },
      { verificationTokenId, idempotencyKey, expiresAt: issued.expiresAt, purpose },
      input.key,
      now,
    );
    // IMPORTANT: throw, do not return {ok:false}, or prior UPDATE/INSERT would COMMIT.
    if (!envelope) throw new Error("Activation-mail encryption aborted");

    const queued = await tx.insert(activationMailOutbox).values({
      verificationTokenId,
      payloadCiphertext: envelope.payloadCiphertext,
      payloadNonce: envelope.payloadNonce,
      payloadKeyId: envelope.payloadKeyId,
      payloadDigest: envelope.payloadDigest,
      idempotencyKey,
      expiresAt: issued.expiresAt,
      createdAt: now,
      updatedAt: now,
    }).returning({ id: activationMailOutbox.id });
    if (!queued[0]) throw new Error("Activation-mail queue insertion aborted");
    return { ok: true, queued: true };
}
