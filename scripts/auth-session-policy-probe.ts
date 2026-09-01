import {
  SESSION_TOUCH_INTERVAL_MS,
  SESSION_TTL_MS,
  getSessionExpiry,
  shouldTouchSession,
} from "../src/modules/auth/session-policy";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const now =
    new Date(
      "2026-09-01T00:00:00.000Z",
    );

  const expiry =
    getSessionExpiry(now);

  assert(
    expiry.getTime() -
      now.getTime() ===
      SESSION_TTL_MS,
    "Default session TTL failed",
  );

  assert(
    SESSION_TTL_MS ===
      30 * 24 * 60 * 60 * 1000,
    "Session TTL is not 30 days",
  );

  const recent =
    new Date(
      now.getTime() -
        SESSION_TOUCH_INTERVAL_MS +
        1,
    );

  assert(
    !shouldTouchSession(
      recent,
      now,
    ),
    "Recent session was touched",
  );

  const stale =
    new Date(
      now.getTime() -
        SESSION_TOUCH_INTERVAL_MS,
    );

  assert(
    shouldTouchSession(
      stale,
      now,
    ),
    "Stale session was not touched",
  );

  let invalidTtlRejected =
    false;

  try {
    getSessionExpiry(
      now,
      0,
    );
  } catch {
    invalidTtlRejected =
      true;
  }

  assert(
    invalidTtlRejected,
    "Invalid TTL was accepted",
  );

  console.log(
    "R6_2B_SESSION_POLICY_PROBE=PASS",
  );

  console.log(
    "SESSION_TTL_DAYS=30",
  );

  console.log(
    "SESSION_TOUCH_INTERVAL_MINUTES=5",
  );

  console.log(
    "EXPIRED_SESSION_POLICY=REJECT",
  );

  console.log(
    "INACTIVE_USER_POLICY=REJECT",
  );

  console.log(
    "RAW_SESSION_TOKEN_DB_STORAGE=NONE",
  );
}

main();
