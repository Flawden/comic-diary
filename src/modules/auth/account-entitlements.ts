import {
  and,
  eq,
} from "drizzle-orm";

import { db } from "@/db";
import {
  userEntitlements,
} from "@/db/schema";

export type AccountEntitlement =
  typeof userEntitlements.$inferSelect.entitlement;

export async function hasAccountEntitlement(
  userId: number,
  entitlement: AccountEntitlement,
): Promise<boolean> {
  if (
    !Number.isInteger(userId) ||
    userId <= 0
  ) {
    return false;
  }

  const rows = await db
    .select({
      userId: userEntitlements.userId,
    })
    .from(userEntitlements)
    .where(
      and(
        eq(
          userEntitlements.userId,
          userId,
        ),
        eq(
          userEntitlements.entitlement,
          entitlement,
        ),
      ),
    )
    .limit(1);

  return rows.length === 1;
}

export function hasPrivateCatalogEntitlement(
  userId: number,
): Promise<boolean> {
  return hasAccountEntitlement(
    userId,
    "PRIVATE_CATALOG",
  );
}
