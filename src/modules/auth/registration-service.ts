import {
  eq,
} from "drizzle-orm";

import {
  db,
} from "@/db";

import {
  users,
} from "@/db/schema";

import type {
  UserRole,
} from "./permissions";

import {
  normalizeLoginIdentifier,
} from "./login-identifier";

import {
  hashPassword,
} from "./password";

const REGISTRATION_PASSWORD_MIN_CHARACTERS =
  10;

const REGISTRATION_PASSWORD_MAX_BYTES =
  256;

export type RegisteredUser = {
  id: number;
  email: string;
  displayName: string | null;
  role: UserRole;
};

export type RegistrationFailureKind =
  | "invalid_email"
  | "weak_password"
  | "email_unavailable";

export type RegistrationResult =
  | {
      ok: true;
      user: RegisteredUser;
    }
  | {
      ok: false;
      kind:
        RegistrationFailureKind;
    };

export function normalizeRegistrationEmail(
  value: string,
): string | null {
  const email =
    normalizeLoginIdentifier(
      value,
    );

  if (
    !email ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+$/.test(
      email,
    )
  ) {
    return null;
  }

  return email;
}

export function isRegistrationPasswordAllowed(
  password: string,
): boolean {
  if (
    password.length <
      REGISTRATION_PASSWORD_MIN_CHARACTERS ||
    password.trim().length ===
      0
  ) {
    return false;
  }

  return (
    Buffer.byteLength(
      password,
      "utf8",
    ) <=
    REGISTRATION_PASSWORD_MAX_BYTES
  );
}

function isUniqueViolation(
  error: unknown,
): boolean {
  if (
    typeof error !==
      "object" ||
    error === null ||
    !(
      "code" in error
    )
  ) {
    return false;
  }

  return (
    (
      error as {
        code?: unknown;
      }
    ).code ===
    "23505"
  );
}

export async function registerPasswordUser(
  rawEmail: string,
  password: string,
): Promise<RegistrationResult> {
  const email =
    normalizeRegistrationEmail(
      rawEmail,
    );

  if (!email) {
    return {
      ok: false,
      kind:
        "invalid_email",
    };
  }

  if (
    !isRegistrationPasswordAllowed(
      password,
    )
  ) {
    return {
      ok: false,
      kind:
        "weak_password",
    };
  }

  /*
   * Existing active and inactive accounts are both
   * unavailable for public self-registration.
   *
   * Registration must never reactivate or overwrite an
   * existing identity.
   */
  const existing =
    await db
      .select({
        id:
          users.id,
      })
      .from(users)
      .where(
        eq(
          users.email,
          email,
        ),
      )
      .limit(1);

  if (existing[0]) {
    return {
      ok: false,
      kind:
        "email_unavailable",
    };
  }

  const passwordHash =
    await hashPassword(
      password,
    );

  try {
    const rows =
      await db
        .insert(users)
        .values({
          email,
          passwordHash,

          /*
           * Public registration has no role selector.
           * The server explicitly fixes the new account
           * to USER even though the schema default is
           * also USER.
           */
          role:
            "USER",

          isActive:
            true,
        })
        .returning({
          id:
            users.id,

          email:
            users.email,

          displayName:
            users.displayName,

          role:
            users.role,

          isActive:
            users.isActive,
        });

    const user =
      rows[0];

    if (
      !user ||
      user.role !==
        "USER" ||
      !user.isActive
    ) {
      throw new Error(
        "Registration user invariant failed",
      );
    }

    return {
      ok: true,

      user: {
        id:
          user.id,

        email:
          user.email,

        displayName:
          user.displayName,

        role:
          user.role,
      },
    };
  } catch (error) {
    /*
     * The pre-check gives a friendly fast path, while the
     * unique constraint remains the race-safe authority.
     */
    if (
      isUniqueViolation(
        error,
      )
    ) {
      return {
        ok: false,
        kind:
          "email_unavailable",
      };
    }

    throw error;
  }
}
