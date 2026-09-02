import type { UserRole } from "./permissions";
import {
  and,
  eq,
  gt,
  lte,
} from "drizzle-orm";

import { db } from "@/db";
import {
  sessions,
  users,
} from "@/db/schema";

import {
  getSessionExpiry,
  shouldTouchSession,
} from "./session-policy";
import {
  createSessionToken,
  hashSessionToken,
} from "./session-token";

export type AuthenticatedUser = {
  id: number;
  email: string;
  displayName: string | null;
  role: UserRole;
};

export type AuthenticatedSession = {
  sessionId: number;
  expiresAt: Date;
  user: AuthenticatedUser;
};

export type CreatedSession = {
  token: string;
  expiresAt: Date;
};

export async function createUserSession(
  userId: number,
  now: Date = new Date(),
): Promise<CreatedSession> {
  const userRows = await db
    .select({
      id: users.id,
    })
    .from(users)
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
    .limit(1);

  if (!userRows[0]) {
    throw new Error(
      "Cannot create session for inactive or missing user",
    );
  }

  const token =
    createSessionToken();

  const tokenHash =
    hashSessionToken(token);

  const expiresAt =
    getSessionExpiry(now);

  const rows = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash,
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
    })
    .returning({
      id: sessions.id,
    });

  if (!rows[0]) {
    throw new Error(
      "Session was not created",
    );
  }

  /*
   * The raw token is returned to the
   * application layer for the browser
   * cookie.
   *
   * Only tokenHash was persisted.
   */
  return {
    token,
    expiresAt,
  };
}

export async function getAuthenticatedSession(
  token: string,
  now: Date = new Date(),
): Promise<AuthenticatedSession | null> {
  if (!token) {
    return null;
  }

  const tokenHash =
    hashSessionToken(token);

  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,

      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(
      users,
      eq(
        sessions.userId,
        users.id,
      ),
    )
    .where(
      and(
        eq(
          sessions.tokenHash,
          tokenHash,
        ),
        gt(
          sessions.expiresAt,
          now,
        ),
        eq(
          users.isActive,
          true,
        ),
      ),
    )
    .limit(1);

  const row =
    rows[0];

  if (!row) {
    return null;
  }

  /*
   * Do not write on every request.
   * last_seen_at is touched at most
   * once per configured interval.
   */
  if (
    shouldTouchSession(
      row.lastSeenAt,
      now,
    )
  ) {
    await db
      .update(sessions)
      .set({
        lastSeenAt: now,
      })
      .where(
        eq(
          sessions.id,
          row.sessionId,
        ),
      );
  }

  return {
    sessionId:
      row.sessionId,

    expiresAt:
      row.expiresAt,

    user: {
      id: row.userId,
      email: row.email,
      displayName:
        row.displayName,
      role: row.role,
    },
  };
}

export async function revokeSession(
  token: string,
): Promise<boolean> {
  if (!token) {
    return false;
  }

  const rows = await db
    .delete(sessions)
    .where(
      eq(
        sessions.tokenHash,
        hashSessionToken(token),
      ),
    )
    .returning({
      id: sessions.id,
    });

  return rows.length > 0;
}

export async function revokeAllUserSessions(
  userId: number,
): Promise<number> {
  const rows = await db
    .delete(sessions)
    .where(
      eq(
        sessions.userId,
        userId,
      ),
    )
    .returning({
      id: sessions.id,
    });

  return rows.length;
}

export async function deleteExpiredSessions(
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .delete(sessions)
    .where(
      lte(
        sessions.expiresAt,
        now,
      ),
    )
    .returning({
      id: sessions.id,
    });

  return rows.length;
}
