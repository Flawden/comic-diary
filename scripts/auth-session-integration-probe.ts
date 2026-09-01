import pg from "pg";

import {
  createUserSession,
  deleteExpiredSessions,
  getAuthenticatedSession,
  revokeAllUserSessions,
  revokeSession,
} from "../src/modules/auth/session-service";
import {
  hashSessionToken,
} from "../src/modules/auth/session-token";

const databaseUrl =
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required",
  );
}

const { Pool } = pg;

const pool =
  new Pool({
    connectionString:
      databaseUrl,
  });

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const now =
    new Date(
      "2026-09-01T12:00:00.000Z",
    );

  const inserted =
    await pool.query<{
      id: number;
    }>(
      `
        INSERT INTO users (
          email,
          display_name,
          role,
          is_active
        )
        VALUES (
          $1,
          $2,
          'USER',
          true
        )
        RETURNING id
      `,
      [
        "r62b@example.test",
        "R6.2B Test User",
      ],
    );

  const userId =
    inserted.rows[0]?.id;

  assert(
    typeof userId === "number",
    "Test user was not created",
  );

  /*
   * CREATE
   */
  const created =
    await createUserSession(
      userId,
      now,
    );

  assert(
    created.token.length === 43,
    "Unexpected raw token length",
  );

  const stored =
    await pool.query<{
      token_hash: string;
      expires_at: Date;
      last_seen_at: Date;
    }>(
      `
        SELECT
          token_hash,
          expires_at,
          last_seen_at
        FROM sessions
        WHERE user_id = $1
      `,
      [userId],
    );

  assert(
    stored.rowCount === 1,
    "Session row missing",
  );

  const storedHash =
    stored.rows[0].token_hash;

  assert(
    storedHash ===
      hashSessionToken(
        created.token,
      ),
    "Stored digest mismatch",
  );

  assert(
    storedHash !==
      created.token,
    "Raw session token was stored",
  );

  assert(
    /^[0-9a-f]{64}$/.test(
      storedHash,
    ),
    "Stored token is not SHA-256 hex",
  );

  /*
   * AUTHENTICATE
   */
  const authenticated =
    await getAuthenticatedSession(
      created.token,
      new Date(
        now.getTime() + 1000,
      ),
    );

  assert(
    authenticated !== null,
    "Valid session rejected",
  );

  assert(
    authenticated.user.id ===
      userId,
    "Wrong authenticated user",
  );

  assert(
    authenticated.user.role ===
      "USER",
    "Wrong authenticated role",
  );

  /*
   * LAST-SEEN TOUCH
   */
  const oldSeen =
    new Date(
      now.getTime() -
        10 * 60 * 1000,
    );

  await pool.query(
    `
      UPDATE sessions
      SET last_seen_at = $1
      WHERE token_hash = $2
    `,
    [
      oldSeen,
      storedHash,
    ],
  );

  const touchNow =
    new Date(
      now.getTime() + 2000,
    );

  const touchedAuth =
    await getAuthenticatedSession(
      created.token,
      touchNow,
    );

  assert(
    touchedAuth !== null,
    "Session rejected during touch",
  );

  const touched =
    await pool.query<{
      last_seen_at: Date;
    }>(
      `
        SELECT last_seen_at
        FROM sessions
        WHERE token_hash = $1
      `,
      [storedHash],
    );

  assert(
    touched.rows[0].last_seen_at
      .getTime() ===
      touchNow.getTime(),
    "last_seen_at was not touched",
  );

  /*
   * INACTIVE USER REJECTION
   */
  await pool.query(
    `
      UPDATE users
      SET is_active = false
      WHERE id = $1
    `,
    [userId],
  );

  const inactiveAuth =
    await getAuthenticatedSession(
      created.token,
      touchNow,
    );

  assert(
    inactiveAuth === null,
    "Inactive user authenticated",
  );

  let inactiveCreateRejected =
    false;

  try {
    await createUserSession(
      userId,
      touchNow,
    );
  } catch {
    inactiveCreateRejected =
      true;
  }

  assert(
    inactiveCreateRejected,
    "Inactive user received new session",
  );

  await pool.query(
    `
      UPDATE users
      SET is_active = true
      WHERE id = $1
    `,
    [userId],
  );

  /*
   * EXACT EXPIRY BOUNDARY
   */
  await pool.query(
    `
      UPDATE sessions
      SET expires_at = $1
      WHERE token_hash = $2
    `,
    [
      touchNow,
      storedHash,
    ],
  );

  const expiredAuth =
    await getAuthenticatedSession(
      created.token,
      touchNow,
    );

  assert(
    expiredAuth === null,
    "Session authenticated at exact expiry",
  );

  const cleaned =
    await deleteExpiredSessions(
      touchNow,
    );

  assert(
    cleaned === 1,
    "Exact-expiry cleanup failed",
  );

  /*
   * REVOKE SINGLE SESSION
   */
  const revokeCandidate =
    await createUserSession(
      userId,
      touchNow,
    );

  assert(
    await revokeSession(
      revokeCandidate.token,
    ),
    "Session revoke returned false",
  );

  assert(
    !await revokeSession(
      revokeCandidate.token,
    ),
    "Repeated revoke returned true",
  );

  assert(
    await getAuthenticatedSession(
      revokeCandidate.token,
      touchNow,
    ) === null,
    "Revoked session authenticated",
  );

  /*
   * REVOKE ALL USER SESSIONS
   */
  await createUserSession(
    userId,
    touchNow,
  );

  await createUserSession(
    userId,
    touchNow,
  );

  const revokedAll =
    await revokeAllUserSessions(
      userId,
    );

  assert(
    revokedAll === 2,
    "Unexpected revoke-all count",
  );

  const remaining =
    await pool.query<{
      count: string;
    }>(
      `
        SELECT count(*)::text AS count
        FROM sessions
        WHERE user_id = $1
      `,
      [userId],
    );

  assert(
    remaining.rows[0].count ===
      "0",
    "Sessions remain after revoke-all",
  );

  console.log(
    "R6_2B_DB_INTEGRATION_PROBE=PASS",
  );

  console.log(
    "SESSION_CREATE=PASS",
  );

  console.log(
    "SESSION_DB_STORAGE=SHA256_ONLY",
  );

  console.log(
    "SESSION_AUTHENTICATE=PASS",
  );

  console.log(
    "SESSION_LAST_SEEN_TOUCH=PASS",
  );

  console.log(
    "INACTIVE_AUTH=REJECTED",
  );

  console.log(
    "INACTIVE_SESSION_CREATE=REJECTED",
  );

  console.log(
    "EXACT_EXPIRY_AUTH=REJECTED",
  );

  console.log(
    "EXACT_EXPIRY_CLEANUP=PASS",
  );

  console.log(
    "SESSION_REVOKE=PASS",
  );

  console.log(
    "SESSION_REVOKE_ALL=PASS",
  );

  console.log(
    "RAW_TOKEN_POSTGRESQL=ABSENT",
  );
}

main()
  .then(async () => {
    await pool.end();

    /*
     * src/db owns its application Pool,
     * so terminate this one-shot probe
     * explicitly after all assertions.
     */
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);

    await pool.end()
      .catch(() => {});

    process.exit(1);
  });
