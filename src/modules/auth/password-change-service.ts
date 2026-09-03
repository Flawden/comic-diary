import {
  and,
  eq,
} from "drizzle-orm";

import {
  db,
} from "@/db";

import {
  sessions,
  users,
} from "@/db/schema";

import {
  hashPassword,
  verifyPassword,
} from "./password";

import {
  isRegistrationPasswordAllowed,
} from "./registration-service";

import {
  getSessionExpiry,
} from "./session-policy";

import {
  createSessionToken,
  hashSessionToken,
} from "./session-token";

export type OwnPasswordChangeFailureKind =
  | "account_unavailable"
  | "invalid_current_password"
  | "weak_password"
  | "password_unchanged";

export type OwnPasswordChangeResult =
  | {
      ok: true;
      sessionsRevoked: number;
      session: {
        token: string;
        expiresAt: Date;
      };
    }
  | {
      ok: false;
      kind:
        OwnPasswordChangeFailureKind;
    };

/**
 * Change the password of the authenticated account.
 *
 * Security properties:
 * - target identity comes only from the authenticated server session;
 * - the user row is locked so concurrent password changes serialize;
 * - current password verification happens against the locked row;
 * - password update, revoke-all, and replacement-session creation are one
 *   PostgreSQL transaction;
 * - only an Argon2id password hash and SHA-256 session token digest persist.
 */
export async function changeOwnPassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
  now: Date = new Date(),
): Promise<OwnPasswordChangeResult> {
  if (
    !Number.isInteger(
      userId,
    ) ||
    userId <= 0
  ) {
    return {
      ok: false,
      kind:
        "account_unavailable",
    };
  }

  if (
    !isRegistrationPasswordAllowed(
      newPassword,
    )
  ) {
    return {
      ok: false,
      kind:
        "weak_password",
    };
  }

  return db.transaction(
    async (
      tx,
    ) => {
      const rows =
        await tx
          .select({
            id:
              users.id,

            passwordHash:
              users.passwordHash,
          })
          .from(
            users,
          )
          .where(
            and(
              eq(
                users.id,
                userId,
              ),
              eq(
                users.isActive,
                true,
              ),
            ),
          )
          .limit(
            1,
          )
          .for(
            "update",
          );

      const account =
        rows[0];

      if (
        !account ||
        !account.passwordHash
      ) {
        return {
          ok: false,
          kind:
            "account_unavailable",
        } as const;
      }

      const currentPasswordValid =
        await verifyPassword(
          account.passwordHash,
          currentPassword,
        );

      if (!currentPasswordValid) {
        return {
          ok: false,
          kind:
            "invalid_current_password",
        } as const;
      }

      if (
        currentPassword ===
          newPassword
      ) {
        return {
          ok: false,
          kind:
            "password_unchanged",
        } as const;
      }

      const passwordHash =
        await hashPassword(
          newPassword,
        );

      const token =
        createSessionToken();

      const tokenHash =
        hashSessionToken(
          token,
        );

      const expiresAt =
        getSessionExpiry(
          now,
        );

      const updated =
        await tx
          .update(
            users,
          )
          .set({
            passwordHash,
            updatedAt:
              now,
          })
          .where(
            eq(
              users.id,
              account.id,
            ),
          )
          .returning({
            id:
              users.id,
          });

      if (!updated[0]) {
        throw new Error(
          "Password update did not persist",
        );
      }

      const revoked =
        await tx
          .delete(
            sessions,
          )
          .where(
            eq(
              sessions.userId,
              account.id,
            ),
          )
          .returning({
            id:
              sessions.id,
          });

      const created =
        await tx
          .insert(
            sessions,
          )
          .values({
            userId:
              account.id,

            tokenHash,
            expiresAt,
            createdAt:
              now,
            lastSeenAt:
              now,
          })
          .returning({
            id:
              sessions.id,
          });

      if (!created[0]) {
        throw new Error(
          "Replacement session was not created",
        );
      }

      return {
        ok: true,

        sessionsRevoked:
          revoked.length,

        session: {
          token,
          expiresAt,
        },
      } as const;
    },
  );
}
