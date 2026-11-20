import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { emailVerificationTokens, users } from "@/db/schema";

import { needsSecurePendingActivation } from "./registration-activation-policy";

import {
  canIssueEmailVerification,
} from "./email-verification-policy";
import {
  issueEmailVerificationToken,
} from "./email-verification-token";

/**
 * INTERNAL ONLY, PENDING ACCOUNTS ONLY: a trusted caller may pass the raw token directly
 * to a future secure mail-delivery boundary. Never return it in JSON or logs.
 * The email property is the locked account's exact address at issuance.
 */
export type EmailVerificationIssueResult =
  | { ok: true; token: string; email: string; expiresAt: Date }
  | { ok: false; kind: "account_unavailable" };

export type EmailVerificationRedeemResult =
  | { ok: true }
  | { ok: false; kind: "invalid_token" };

/**
 * Serialize issuance on the user row, then revoke ANY old open challenge
 * (including expired ones) before inserting. The partial unique index in
 * 0033 adds a database-level invariant under concurrent requests.
 *
 * This is not a public request handler; a future controller MUST authenticate
 * and authorize the caller, rate-limit issuance, and deliver email safely.
 */
export async function issueEmailVerificationForUser(
  userId: number,
): Promise<EmailVerificationIssueResult> {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return { ok: false, kind: "account_unavailable" };
  }

  return db.transaction(async (tx): Promise<EmailVerificationIssueResult> => {
    const accounts = await tx
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        emailVerifiedAt: users.emailVerifiedAt,
        verificationRequiredAt: users.verificationRequiredAt,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update");

    const account = accounts[0];
    if (!account || !needsSecurePendingActivation(account) || !canIssueEmailVerification(account)) {
      return { ok: false, kind: "account_unavailable" };
    }
    if (!account) {
      return { ok: false, kind: "account_unavailable" };
    }

    // Use a fresh clock after acquiring the row lock.
    const now = new Date();
    const issued = issueEmailVerificationToken(now);

    await tx
      .update(emailVerificationTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(emailVerificationTokens.userId, account.id),
          isNull(emailVerificationTokens.consumedAt),
          isNull(emailVerificationTokens.revokedAt),
        ),
      );

    const inserted = await tx
      .insert(emailVerificationTokens)
      .values({
        userId: account.id,
        emailSnapshot: account.email,
        purpose: "pending_activation",
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
        createdAt: now,
      })
      .returning({ id: emailVerificationTokens.id });

    if (!inserted[0]) {
      throw new Error("Email-verification challenge was not stored");
    }

    return {
      ok: true,
      token: issued.token,
      email: account.email,
      expiresAt: issued.expiresAt,
    };
  });
}

/**
 * Retired bearer-only redemption. Deliberately rejects EVERY token and state,
 * without reading or mutating the database. Pending registrations must choose
 * a new password through registration-activation-service; legacy accounts must
 * use legacy-email-verification-service with a live session and current password.
 * Kept as a fail-closed compatibility entrypoint for historical internal callers.
 */
export async function redeemEmailVerificationToken(
  token: unknown,
): Promise<EmailVerificationRedeemResult> {
  void token;
  return { ok: false, kind: "invalid_token" };
}
