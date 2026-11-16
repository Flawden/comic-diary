import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { emailVerificationTokens, users } from "@/db/schema";

import {
  canIssueEmailVerification,
  canRedeemEmailVerification,
} from "./email-verification-policy";
import {
  hashEmailVerificationToken,
  issueEmailVerificationToken,
} from "./email-verification-token";

/**
 * INTERNAL ONLY: a trusted, authorized caller may pass the raw token directly
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
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update");

    const account = accounts[0];
    if (!canIssueEmailVerification(account)) {
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
 * Consumes a token and marks ONLY the current matching mailbox verified in
 * one database transaction; no success cookie/session is created.
 *
 * Lock ordering is always USER -> CHALLENGE to avoid deadlocks with issuance.
 * The first candidate read does not grant authority: all decisions are made
 * again under locks. A repeated or concurrent claim fails closed.
 *
 * SECURITY BLOCKER: before a public route is enabled, decide how legacy
 * unverified accounts, pre-verification sessions, and unsolicited registrations
 * are handled. This service does NOT solve that identity-claim policy.
 */
export async function redeemEmailVerificationToken(
  token: unknown,
): Promise<EmailVerificationRedeemResult> {
  const tokenHash = hashEmailVerificationToken(token);
  if (!tokenHash) {
    return { ok: false, kind: "invalid_token" };
  }

  return db.transaction(async (tx): Promise<EmailVerificationRedeemResult> => {
    // Only discover the stable user ID; do not trust any other candidate data.
    const candidates = await tx
      .select({ userId: emailVerificationTokens.userId })
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash))
      .limit(1);
    const candidate = candidates[0];
    if (!candidate) {
      return { ok: false, kind: "invalid_token" };
    }

    const accounts = await tx
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        emailVerifiedAt: users.emailVerifiedAt,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, candidate.userId))
      .limit(1)
      .for("update");
    const account = accounts[0];
    if (!canIssueEmailVerification(account) || !account) {
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
    if (!canRedeemEmailVerification(account, challenge, now)) {
      return { ok: false, kind: "invalid_token" };
    }
    if (!challenge) {
      return { ok: false, kind: "invalid_token" };
    }

    const consumed = await tx
      .update(emailVerificationTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(emailVerificationTokens.id, challenge.id),
          isNull(emailVerificationTokens.consumedAt),
          isNull(emailVerificationTokens.revokedAt),
        ),
      )
      .returning({ id: emailVerificationTokens.id });
    if (!consumed[0]) {
      return { ok: false, kind: "invalid_token" };
    }

    const verified = await tx
      .update(users)
      .set({ emailVerifiedAt: now, updatedAt: now })
      .where(
        and(
          eq(users.id, account.id),
          eq(users.email, account.email),
          eq(users.isActive, true),
          isNull(users.emailVerifiedAt),
        ),
      )
      .returning({ id: users.id });
    if (!verified[0]) {
      // Roll back token consumption too; never commit a partially verified state.
      throw new Error("Email-verification account update did not persist");
    }

    // Defense in depth; this challenge is already consumed.
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

    return { ok: true };
  });
}
