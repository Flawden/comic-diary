import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { passwordResetTokens, sessions, users } from "@/db/schema";

import { hashPassword } from "./password";
import {
  hashPasswordResetToken,
  isPasswordResetTokenExpired,
  issuePasswordResetToken,
} from "./password-reset-token";
import { isRegistrationPasswordAllowed } from "./registration-service";

/** Internal only. No unauthenticated route or email sender in AUTH-01B2. */
export type PasswordResetIssueResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; kind: "account_unavailable" };

export type PasswordResetRedeemResult =
  | { ok: true; sessionsRevoked: number }
  | { ok: false; kind: "invalid_token" | "weak_password" };

/**
 * For a trusted, previously authorised caller, issue one reset secret.
 *
 * Hold the user row lock across old-token revocation and insert. The partial
 * unique index allows only one unconsumed/unrevoked row per user, including
 * expired rows, so revocation is mandatory before inserting a new row.
 *
 * A mailbox MUST be verified before any recovery token can be issued.
 * Never log or persist `token`. No public route may call this until the
 * unverified-mailbox policy, rate limits and mail transport are approved.
 */
export async function issuePasswordResetForUser(
  userId: number,
): Promise<PasswordResetIssueResult> {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return { ok: false, kind: "account_unavailable" };
  }

  return db.transaction(async (tx): Promise<PasswordResetIssueResult> => {
    const accounts = await tx
      .select({ id: users.id, passwordHash: users.passwordHash, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1)
      .for("update");

    const account = accounts[0];
    if (!account?.passwordHash || account.emailVerifiedAt === null) {
      return { ok: false, kind: "account_unavailable" };
    }

    // Compute time after acquiring the lock, not while waiting for it.
    const now = new Date();
    const issued = issuePasswordResetToken(now);

    await tx
      .update(passwordResetTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, account.id),
          isNull(passwordResetTokens.consumedAt),
          isNull(passwordResetTokens.revokedAt),
        ),
      );

    const inserted = await tx
      .insert(passwordResetTokens)
      .values({
        userId: account.id,
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
        createdAt: now,
      })
      .returning({ id: passwordResetTokens.id });

    if (!inserted[0]) {
      throw new Error("Password-reset token was not stored");
    }

    // Raw token escapes solely to a future secure mail-delivery boundary.
    return { ok: true, token: issued.token, expiresAt: issued.expiresAt };
  });
}

/**
 * Atomic password recovery: no claim-then-update split is permitted.
 *
 * Lock order is always user -> reset token. An initial token-hash read only
 * obtains the stable user ID; all security decisions are rechecked AFTER
 * acquiring the user and token locks. Concurrent issuance, own password
 * changes and parallel redemption therefore serialize on the user row.
 *
 * Redemption rechecks the verified-mailbox gate after locking the user.
 * A token from an older verification epoch is invalid if ownership changes.
 * Success changes the Argon2id password, consumes the token and revokes ALL
 * sessions in one transaction. No replacement session is issued: log in again.
 */
export async function redeemPasswordResetToken(
  token: unknown,
  newPassword: string,
): Promise<PasswordResetRedeemResult> {
  const tokenHash = hashPasswordResetToken(token);
  if (!tokenHash) {
    return { ok: false, kind: "invalid_token" };
  }

  if (
    typeof newPassword !== "string" ||
    !isRegistrationPasswordAllowed(newPassword)
  ) {
    return { ok: false, kind: "weak_password" };
  }

  return db.transaction(async (tx): Promise<PasswordResetRedeemResult> => {
    const candidates = await tx
      .select({ userId: passwordResetTokens.userId })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);

    const candidate = candidates[0];
    if (!candidate) {
      return { ok: false, kind: "invalid_token" };
    }

    const accounts = await tx
      .select({ id: users.id, passwordHash: users.passwordHash, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(and(eq(users.id, candidate.userId), eq(users.isActive, true)))
      .limit(1)
      .for("update");

    const account = accounts[0];
    if (!account?.passwordHash || account.emailVerifiedAt === null) {
      return { ok: false, kind: "invalid_token" };
    }

    const rows = await tx
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
        expiresAt: passwordResetTokens.expiresAt,
        createdAt: passwordResetTokens.createdAt,
        consumedAt: passwordResetTokens.consumedAt,
        revokedAt: passwordResetTokens.revokedAt,
      })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1)
      .for("update");

    const reset = rows[0];
    const now = new Date();
    if (
      !reset ||
      reset.userId !== account.id ||
      reset.consumedAt !== null ||
      reset.revokedAt !== null ||
      isPasswordResetTokenExpired(reset.expiresAt, now) ||
      account.emailVerifiedAt.getTime() > reset.createdAt.getTime()
    ) {
      return { ok: false, kind: "invalid_token" };
    }

    const passwordHash = await hashPassword(newPassword);

    const consumed = await tx
      .update(passwordResetTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(passwordResetTokens.id, reset.id),
          isNull(passwordResetTokens.consumedAt),
          isNull(passwordResetTokens.revokedAt),
        ),
      )
      .returning({ id: passwordResetTokens.id });

    if (!consumed[0]) {
      return { ok: false, kind: "invalid_token" };
    }

    const updated = await tx
      .update(users)
      .set({ passwordHash, updatedAt: now })
      .where(eq(users.id, account.id))
      .returning({ id: users.id });

    if (!updated[0]) {
      throw new Error("Password reset did not update account");
    }

    const revoked = await tx
      .delete(sessions)
      .where(eq(sessions.userId, account.id))
      .returning({ id: sessions.id });

    // Defensive: revoke any other open links; the current token is consumed.
    await tx
      .update(passwordResetTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, account.id),
          isNull(passwordResetTokens.consumedAt),
          isNull(passwordResetTokens.revokedAt),
        ),
      );

    return { ok: true, sessionsRevoked: revoked.length };
  });
}
