export const SESSION_TTL_MS =
  30 * 24 * 60 * 60 * 1000;

export const SESSION_TOUCH_INTERVAL_MS =
  5 * 60 * 1000;

export function getSessionExpiry(
  now: Date = new Date(),
  ttlMs: number = SESSION_TTL_MS,
): Date {
  if (
    !Number.isFinite(ttlMs) ||
    ttlMs <= 0
  ) {
    throw new Error(
      "Session TTL must be positive",
    );
  }

  return new Date(
    now.getTime() + ttlMs,
  );
}

export function shouldTouchSession(
  lastSeenAt: Date,
  now: Date = new Date(),
): boolean {
  return (
    now.getTime() -
      lastSeenAt.getTime() >=
    SESSION_TOUCH_INTERVAL_MS
  );
}
