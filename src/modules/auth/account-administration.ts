import {
  eq,
  sql,
} from "drizzle-orm";

import {
  db,
} from "@/db";
import {
  sessions,
  userEntitlements,
  users,
} from "@/db/schema";

import {
  requirePermission,
  type UserRole,
} from "./permissions";

export const ACCOUNT_ENTITLEMENTS = [
  "PRIVATE_CATALOG",
] as const;

export type AccountEntitlement =
  (typeof ACCOUNT_ENTITLEMENTS)[number];

function normalizeEntitlements(
  values: readonly AccountEntitlement[],
): AccountEntitlement[] {
  return [...new Set(values)].sort();
}

function sameEntitlements(
  left: readonly AccountEntitlement[],
  right: readonly AccountEntitlement[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (value, index) =>
        value === right[index],
    )
  );
}

/**
 * Serializes mutations that can change whether the
 * installation still has an active ADMIN.
 *
 * The operator bootstrap script deliberately uses
 * the same PostgreSQL advisory lock.
 */
export const ACCOUNT_AUTHORITY_ADVISORY_LOCK =
  536000002;

export type AccountAdministrationErrorKind =
  | "invalid-update"
  | "user-not-found"
  | "last-active-admin";

export class AccountAdministrationError
  extends Error {
  constructor(
    readonly kind:
      AccountAdministrationErrorKind,
  ) {
    super(
      `Account administration failed: ${kind}`,
    );

    this.name =
      "AccountAdministrationError";
  }
}

export type ManagedAccountUpdate = {
  role?: UserRole;
  isActive?: boolean;
  entitlements?: readonly AccountEntitlement[];
};

export type ManagedAccountUpdateResult = {
  user: {
    id: number;
    email: string;
    role: UserRole;
    isActive: boolean;
    entitlements: AccountEntitlement[];
  };

  sessionsRevoked: number;
};

export async function updateManagedAccount(
  actorRole: UserRole,
  targetUserId: number,
  update: ManagedAccountUpdate,
): Promise<ManagedAccountUpdateResult> {
  requirePermission(
    actorRole,
    "ADMIN_USERS",
  );

  if (
    !Number.isInteger(
      targetUserId,
    ) ||
    targetUserId <= 0 ||
    (
      update.role ===
        undefined &&
      update.isActive ===
        undefined &&
      update.entitlements ===
        undefined
    )
  ) {
    throw new AccountAdministrationError(
      "invalid-update",
    );
  }

  return db.transaction(
    async (
      tx,
    ) => {
      await tx.execute(
        sql`
          SELECT pg_advisory_xact_lock(
            ${ACCOUNT_AUTHORITY_ADVISORY_LOCK}
          )
        `,
      );

      const rows =
        await tx
          .select({
            id:
              users.id,

            email:
              users.email,

            role:
              users.role,

            isActive:
              users.isActive,
          })
          .from(
            users,
          )
          .where(
            eq(
              users.id,
              targetUserId,
            ),
          )
          .limit(
            1,
          )
          .for(
            "update",
          );

      const target =
        rows[0];

      if (!target) {
        throw new AccountAdministrationError(
          "user-not-found",
        );
      }

      const currentEntitlementRows =
        await tx
          .select({
            entitlement:
              userEntitlements.entitlement,
          })
          .from(
            userEntitlements,
          )
          .where(
            eq(
              userEntitlements.userId,
              target.id,
            ),
          );

      const currentEntitlements =
        normalizeEntitlements(
          currentEntitlementRows.map(
            (row) =>
              row.entitlement,
          ),
        );

      const nextEntitlements =
        update.entitlements ===
          undefined
          ? currentEntitlements
          : normalizeEntitlements(
              update.entitlements,
            );

      const nextRole =
        update.role ??
        target.role;

      const nextIsActive =
        update.isActive ??
        target.isActive;

      const targetWasActiveAdmin =
        target.role ===
          "ADMIN" &&
        target.isActive;

      const targetRemainsActiveAdmin =
        nextRole ===
          "ADMIN" &&
        nextIsActive;

      if (
        targetWasActiveAdmin &&
        !targetRemainsActiveAdmin
      ) {
        const countRows =
          await tx.execute<{
            active_admins: number;
          }>(
            sql`
              SELECT
                count(*)::int
                  AS active_admins
              FROM users
              WHERE role = 'ADMIN'
                AND is_active = true
            `,
          );

        const activeAdmins =
          countRows.rows[0]
            ?.active_admins ??
          0;

        if (
          activeAdmins <=
          1
        ) {
          throw new AccountAdministrationError(
            "last-active-admin",
          );
        }
      }

      const entitlementChanged =
        !sameEntitlements(
          currentEntitlements,
          nextEntitlements,
        );

      const changed =
        target.role !==
          nextRole ||
        target.isActive !==
          nextIsActive ||
        entitlementChanged;

      const updatedRows =
        await tx
          .update(
            users,
          )
          .set({
            role:
              nextRole,

            isActive:
              nextIsActive,

            updatedAt:
              new Date(),
          })
          .where(
            eq(
              users.id,
              target.id,
            ),
          )
          .returning({
            id:
              users.id,

            email:
              users.email,

            role:
              users.role,

            isActive:
              users.isActive,
          });

      const updatedUser =
        updatedRows[0];

      if (!updatedUser) {
        throw new AccountAdministrationError(
          "user-not-found",
        );
      }

      if (
        entitlementChanged
      ) {
        await tx
          .delete(
            userEntitlements,
          )
          .where(
            eq(
              userEntitlements.userId,
              target.id,
            ),
          );

        if (
          nextEntitlements.length >
          0
        ) {
          await tx
            .insert(
              userEntitlements,
            )
            .values(
              nextEntitlements.map(
                (entitlement) => ({
                  userId:
                    target.id,
                  entitlement,
                }),
              ),
            );
        }
      }

      let sessionsRevoked =
        0;

      /*
       * Any authority/state change forces fresh
       * authentication instead of preserving old
       * browser sessions across the transition.
       */
      if (changed) {
        const revoked =
          await tx
            .delete(
              sessions,
            )
            .where(
              eq(
                sessions.userId,
                target.id,
              ),
            )
            .returning({
              id:
                sessions.id,
            });

        sessionsRevoked =
          revoked.length;
      }

      return {
        user: {
          ...updatedUser,
          entitlements:
            nextEntitlements,
        },

        sessionsRevoked,
      };
    },
  );
}
