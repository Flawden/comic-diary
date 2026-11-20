import type { UserRole } from "./permissions";
import {
  eq,
} from "drizzle-orm";

import {
  db,
} from "@/db";

import {
  users,
} from "@/db/schema";

import {
  normalizeLoginIdentifier,
} from "./login-identifier";

import {
  verifyPassword,
} from "./password";

import { canUseFullAccountSession } from "./registration-activation-policy";

export type PasswordLoginUser = {
  id: number;
  email: string;
  displayName: string | null;
  role: UserRole;
};

export async function authenticatePasswordLogin(
  identifier: string,
  password: string,
): Promise<PasswordLoginUser | null> {
  const email =
    normalizeLoginIdentifier(
      identifier,
    );

  if (
    !email ||
    !password
  ) {
    return null;
  }

  const rows = await db
    .select({
      id:
        users.id,

      email:
        users.email,

      displayName:
        users.displayName,

      passwordHash:
        users.passwordHash,

      role:
        users.role,

      isActive:
        users.isActive,

      emailVerifiedAt: users.emailVerifiedAt,
      verificationRequiredAt: users.verificationRequiredAt,
    })
    .from(users)
    .where(
      eq(
        users.email,
        email,
      ),
    )
    .limit(1);

  const user =
    rows[0];

  /*
   * Deliberately return the same result for:
   *
   * - missing user;
   * - account without password;
   * - inactive account;
   * - incorrect password.
   *
   * The HTTP boundary must not expose which
   * part of the credential pair was wrong.
   */
  if (
    !user ||
    !user.isActive ||
    !user.passwordHash
  ) {
    return null;
  }

  const passwordMatches =
    await verifyPassword(
      user.passwordHash,
      password,
    );

  if (!passwordMatches || !canUseFullAccountSession(user)) {
    // Same generic HTTP error for bad credentials and pending activation.
    return null;
  }

  return {
    id:
      user.id,

    email:
      user.email,

    displayName:
      user.displayName,

    role:
      user.role,
  };
}
