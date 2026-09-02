import {
  SESSION_COOKIE_NAME,
} from "./session-cookie";

type CookieValue = {
  value: string;
};

export type SessionCookieReader = {
  get(
    name: string,
  ): CookieValue | undefined;
};

/**
 * Pure cookie-boundary helper.
 *
 * This module deliberately has no database,
 * Next request-context, or environment dependency.
 */
export function readSessionToken(
  cookieStore: SessionCookieReader,
): string | null {
  const value =
    cookieStore.get(
      SESSION_COOKIE_NAME,
    )?.value;

  if (!value) {
    return null;
  }

  return value;
}
