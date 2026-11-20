/**
 * AUTH-01C2B4C: INTERNAL ONLY. Complete a new registration by proving mailbox
 * control AND replacing the password originally supplied before verification.
 * No public route, email sender, cookie issuance or production activation.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { emailVerificationTokens, passwordResetTokens, sessions, users } from "@/db/schema";
import { canRedeemEmailVerification } from "./email-verification-policy";
import { hashEmailVerificationToken } from "./email-verification-token";
import { needsSecurePendingActivation } from "./registration-activation-policy";
import { isRegistrationPasswordAllowed } from "./registration-service";
import { hashPassword } from "./password";

export type PendingActivationResult =
  | { ok: true; sessionsRevoked: number }
  | { ok: false; kind: "invalid_token" | "weak_password" };

/**
 * The candidate token lookup is NOT authorization. Both rows are re-checked
 * under a consistent USER -> TOKEN lock order. One transaction replaces the
 * credential, confirms only the bound mailbox, consumes the token, revokes all
 * sessions, reset links and other outstanding verification links.
 *
 * A new password is deliberately required on every successful activation.
 * The caller must not issue a session here; the owner logs in afterwards.
 */
export async function activatePendingRegistrationWithEmailToken(
  token: unknown,
  newPassword: string,
): Promise<PendingActivationResult> {
  const tokenHash = hashEmailVerificationToken(token);
  if (!tokenHash) return { ok: false, kind: "invalid_token" };
  if (typeof newPassword !== "string" || !isRegistrationPasswordAllowed(newPassword)) {
    return { ok: false, kind: "weak_password" };
  }

  // Hash before starting a DB transaction to avoid holding row locks during Argon2id.
  const passwordHash = await hashPassword(newPassword);

  return db.transaction(async (tx): Promise<PendingActivationResult> => {
    const candidates = await tx
      .select({ userId: emailVerificationTokens.userId })
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash))
      .limit(1);
    const candidate = candidates[0];
    if (!candidate) return { ok: false, kind: "invalid_token" };

    const accounts = await tx
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
        emailVerifiedAt: users.emailVerifiedAt,
        verificationRequiredAt: users.verificationRequiredAt,
      })
      .from(users)
      .where(eq(users.id, candidate.userId))
      .limit(1)
      .for("update");
    const account = accounts[0];
    if (!account || !needsSecurePendingActivation(account)) {
      return { ok: false, kind: "invalid_token" };
    }

    const challenges = await tx
      .select({
        id: emailVerificationTokens.id,
        userId: emailVerificationTokens.userId,
        emailSnapshot: emailVerificationTokens.emailSnapshot,
        createdAt: emailVerificationTokens.createdAt,
        expiresAt: emailVerificationTokens.expiresAt,
        consumedAt: emailVerificationTokens.consumedAt,
        revokedAt: emailVerificationTokens.revokedAt,
      })
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash))
      .limit(1)
      .for("update");
    const challenge = challenges[0];
    const now = new Date();
    if (!canRedeemEmailVerification(account, challenge, now) || !challenge) {
      return { ok: false, kind: "invalid_token" };
    }

    const consumed = await tx
      .update(emailVerificationTokens)
      .set({ consumedAt: now })
      .where(and(
        eq(emailVerificationTokens.id, challenge.id),
        isNull(emailVerificationTokens.consumedAt),
        isNull(emailVerificationTokens.revokedAt),
      ))
      .returning({ id: emailVerificationTokens.id });
    if (!consumed[0]) return { ok: false, kind: "invalid_token" };

    const updated = await tx
      .update(users)
      .set({ passwordHash, emailVerifiedAt: now, updatedAt: now })
      .where(and(
        eq(users.id, account.id),
        eq(users.email, account.email),
        eq(users.isActive, true),
        isNull(users.emailVerifiedAt),
        eq(users.verificationRequiredAt, account.verificationRequiredAt!),
      ))
      .returning({ id: users.id });
    if (!updated[0]) {
      // Throw to roll back token consumption. No partial account activation.
      throw new Error("Pending account activation did not persist");
    }

    const revoked = await tx.delete(sessions)
      .where(eq(sessions.userId, account.id))
      .returning({ id: sessions.id });
    await tx.update(passwordResetTokens)
      .set({ revokedAt: now })
      .where(and(
        eq(passwordResetTokens.userId, account.id),
        isNull(passwordResetTokens.consumedAt),
        isNull(passwordResetTokens.revokedAt),
      ));
    await tx.update(emailVerificationTokens)
      .set({ revokedAt: now })
      .where(and(
        eq(emailVerificationTokens.userId, account.id),
        isNull(emailVerificationTokens.consumedAt),
        isNull(emailVerificationTokens.revokedAt),
      ));
    return { ok: true, sessionsRevoked: revoked.length };
  });
}
