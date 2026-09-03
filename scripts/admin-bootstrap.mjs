import process from "node:process";

import {
  hash,
} from "@node-rs/argon2";
import pg from "pg";

const {
  Pool,
} = pg;

const ACCOUNT_AUTHORITY_ADVISORY_LOCK =
  536000002;

const MAX_PASSWORD_BYTES =
  1024;

const EMAIL_MAX_LENGTH =
  320;

function fail(
  message,
) {
  console.error(
    message,
  );

  process.exitCode =
    1;
}

function parseEmailArgument(
  argv,
) {
  if (
    argv.length !==
      2 ||
    argv[0] !==
      "--email"
  ) {
    throw new Error(
      "Usage: node scripts/admin-bootstrap.mjs --email <email>",
    );
  }

  const email =
    argv[1]
      .trim()
      .toLowerCase();

  if (
    email.length ===
      0 ||
    email.length >
      EMAIL_MAX_LENGTH ||
    email.includes(
      " ",
    ) ||
    !email.includes(
      "@",
    )
  ) {
    throw new Error(
      "Bootstrap email is invalid",
    );
  }

  return email;
}

async function readPasswordFromStdin() {
  if (
    process.stdin.isTTY
  ) {
    throw new Error(
      "Password must be supplied through stdin, not a command argument",
    );
  }

  const chunks =
    [];

  let bytes =
    0;

  for await (
    const chunk of
    process.stdin
  ) {
    bytes +=
      Buffer.byteLength(
        chunk,
      );

    if (
      bytes >
      MAX_PASSWORD_BYTES +
        2
    ) {
      throw new Error(
        "Password is too long",
      );
    }

    chunks.push(
      chunk,
    );
  }

  let password =
    chunks.join(
      "",
    );

  /*
   * Operator helpers normally terminate stdin with
   * one newline. Preserve all other password bytes.
   */
  password =
    password.replace(
      /\r?\n$/,
      "",
    );

  const passwordBytes =
    Buffer.byteLength(
      password,
      "utf8",
    );

  if (
    passwordBytes ===
      0
  ) {
    throw new Error(
      "Password must not be empty",
    );
  }

  if (
    passwordBytes >
      MAX_PASSWORD_BYTES
  ) {
    throw new Error(
      "Password is too long",
    );
  }

  return password;
}

async function hashBootstrapPassword(
  password,
) {
  const passwordHash =
    await hash(
      password,
      {
        memoryCost:
          19_456,

        timeCost:
          2,

        parallelism:
          1,

        outputLen:
          32,
      },
    );

  if (
    !passwordHash.startsWith(
      "$argon2id$",
    )
  ) {
    throw new Error(
      "Password hash is not Argon2id",
    );
  }

  return passwordHash;
}

async function main() {
  const databaseUrl =
    process.env
      .DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not defined",
    );
  }

  const email =
    parseEmailArgument(
      process.argv.slice(
        2,
      ),
    );

  const password =
    await readPasswordFromStdin();

  const passwordHash =
    await hashBootstrapPassword(
      password,
    );

  const pool =
    new Pool({
      connectionString:
        databaseUrl,
    });

  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    try {
      await client.query(
        "SELECT pg_advisory_xact_lock($1)",
        [
          ACCOUNT_AUTHORITY_ADVISORY_LOCK,
        ],
      );

      const adminCountResult =
        await client.query(
          `
            SELECT count(*)::int AS count
            FROM users
            WHERE role = 'ADMIN'
              AND is_active = true
          `,
        );

      const activeAdmins =
        adminCountResult.rows[0]
          ?.count ??
        0;

      if (
        activeAdmins >
        0
      ) {
        await client.query(
          "ROLLBACK",
        );

        console.error(
          "BOOTSTRAP_REFUSED=ACTIVE_ADMIN_EXISTS",
        );

        process.exitCode =
          2;

        return;
      }

      const existingResult =
        await client.query(
          `
            SELECT
              id,
              role,
              is_active
            FROM users
            WHERE email = $1
            LIMIT 1
            FOR UPDATE
          `,
          [
            email,
          ],
        );

      let userId;
      let action;

      if (
        existingResult.rows.length ===
          1
      ) {
        userId =
          existingResult.rows[0].id;

        await client.query(
          `
            UPDATE users
            SET
              password_hash = $1,
              role = 'ADMIN',
              is_active = true,
              updated_at = NOW()
            WHERE id = $2
          `,
          [
            passwordHash,
            userId,
          ],
        );

        await client.query(
          `
            DELETE FROM sessions
            WHERE user_id = $1
          `,
          [
            userId,
          ],
        );

        action =
          "PROMOTED_EXISTING_USER";
      } else {
        const inserted =
          await client.query(
            `
              INSERT INTO users (
                email,
                password_hash,
                role,
                is_active
              )
              VALUES (
                $1,
                $2,
                'ADMIN',
                true
              )
              RETURNING id
            `,
            [
              email,
              passwordHash,
            ],
          );

        userId =
          inserted.rows[0]
            .id;

        action =
          "CREATED_ADMIN";
      }

      const finalResult =
        await client.query(
          `
            SELECT
              id,
              email,
              role,
              is_active,
              password_hash
            FROM users
            WHERE id = $1
          `,
          [
            userId,
          ],
        );

      const finalUser =
        finalResult.rows[0];

      if (
        !finalUser ||
        finalUser.email !==
          email ||
        finalUser.role !==
          "ADMIN" ||
        finalUser.is_active !==
          true ||
        typeof finalUser.password_hash !==
          "string" ||
        !finalUser.password_hash.startsWith(
          "$argon2id$",
        )
      ) {
        throw new Error(
          "Bootstrap postcondition failed",
        );
      }

      await client.query(
        "COMMIT",
      );

      console.log(
        "ADMIN_BOOTSTRAP=PASS",
      );

      console.log(
        `ACTION=${action}`,
      );

      console.log(
        `USER_ID=${userId}`,
      );

      console.log(
        `EMAIL=${email}`,
      );

      console.log(
        "ROLE=ADMIN",
      );

      console.log(
        "IS_ACTIVE=true",
      );

      console.log(
        "PASSWORD_HASH=ARGON2ID",
      );

      console.log(
        "RAW_PASSWORD_PERSISTED=NO",
      );
    } catch (
      error
    ) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        // Preserve the original bootstrap failure.
      }

      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

try {
  await main();
} catch (
  error
) {
  if (
    error instanceof
      Error
  ) {
    fail(
      `ADMIN_BOOTSTRAP_ERROR=${error.message}`,
    );
  } else {
    fail(
      "ADMIN_BOOTSTRAP_ERROR=UNKNOWN",
    );
  }
}
