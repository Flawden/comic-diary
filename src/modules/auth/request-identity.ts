import {
  cookies,
} from "next/headers";

import {
  readSessionToken,
} from "./session-cookie-reader";

import {
  getAuthenticatedSession,
  type AuthenticatedSession,
  type AuthenticatedUser,
} from "./session-service";

/**
 * Resolve the authenticated session associated
 * with the current HTTP request.
 *
 * Missing, expired, revoked, malformed, or
 * inactive-user sessions all resolve to null.
 */
export async function getCurrentSession():
  Promise<AuthenticatedSession | null> {
  const cookieStore =
    await cookies();

  const token =
    readSessionToken(
      cookieStore,
    );

  if (!token) {
    return null;
  }

  return getAuthenticatedSession(
    token,
  );
}

/**
 * Return the authenticated user for the current
 * server request, or null for an anonymous request.
 *
 * Authorization remains a separate explicit layer.
 */
export async function getCurrentUser():
  Promise<AuthenticatedUser | null> {
  const session =
    await getCurrentSession();

  return session?.user ?? null;
}
