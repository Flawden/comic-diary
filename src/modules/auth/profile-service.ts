import {
  and,
  eq,
} from "drizzle-orm";

import {
  db,
} from "@/db";

import {
  users,
} from "@/db/schema";

import {
  normalizeOwnDisplayNameInput,
} from "./display-name";

export type OwnProfileUpdateResult =
  | {
      ok: true;
      displayName:
        string | null;
    }
  | {
      ok: false;
      kind:
        | "invalid_display_name"
        | "account_unavailable";
    };

/**
 * Update only the authenticated user's optional
 * self-managed display name.
 *
 * Email, role, active state, entitlements and
 * session authority are deliberately outside
 * this self-service path.
 */
export async function updateOwnDisplayName(
  userId: number,
  rawDisplayName: string,
  now: Date = new Date(),
): Promise<OwnProfileUpdateResult> {
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

  const normalized =
    normalizeOwnDisplayNameInput(
      rawDisplayName,
    );

  if (!normalized.ok) {
    return normalized;
  }

  const rows =
    await db
      .update(users)
      .set({
        displayName:
          normalized.displayName,
        updatedAt: now,
      })
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
      .returning({
        displayName:
          users.displayName,
      });

  const updated =
    rows[0];

  if (!updated) {
    return {
      ok: false,
      kind:
        "account_unavailable",
    };
  }

  return {
    ok: true,
    displayName:
      updated.displayName,
  };
}
