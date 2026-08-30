import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const databaseUrl =
  process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required for production migrations",
  );
}

const currentDirectory =
  dirname(
    fileURLToPath(
      import.meta.url,
    ),
  );

const migrationsFolder =
  resolve(
    currentDirectory,
    "../drizzle",
  );

const { Pool } = pg;

const pool =
  new Pool({
    connectionString:
      databaseUrl,

    max:
      1,
  });

try {
  const db =
    drizzle(
      pool,
    );

  await migrate(
    db,
    {
      migrationsFolder,
    },
  );

  console.log(
    "Production database migrations completed.",
  );
} finally {
  await pool.end();
}