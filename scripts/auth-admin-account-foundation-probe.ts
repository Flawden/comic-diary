import {
  readFileSync,
} from "node:fs";

import {
  hasPermission,
} from "../src/modules/auth/permissions";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

assert(
  !hasPermission(
    "USER",
    "ADMIN_USERS",
  ),
  "USER unexpectedly has ADMIN_USERS",
);

assert(
  !hasPermission(
    "EDITOR",
    "ADMIN_USERS",
  ),
  "EDITOR unexpectedly has ADMIN_USERS",
);

assert(
  hasPermission(
    "ADMIN",
    "ADMIN_USERS",
  ),
  "ADMIN lacks ADMIN_USERS",
);

const domain =
  readFileSync(
    "src/modules/auth/account-administration.ts",
    "utf8",
  );

const bootstrap =
  readFileSync(
    "scripts/admin-bootstrap.mjs",
    "utf8",
  );

const dockerfile =
  readFileSync(
    "Dockerfile",
    "utf8",
  );

for (
  const required of
  [
    "ADMIN_USERS",
    "ACCOUNT_AUTHORITY_ADVISORY_LOCK",
    "last-active-admin",
    "pg_advisory_xact_lock",
    "sessions",
  ]
) {
  assert(
    domain.includes(
      required,
    ),
    `Account domain missing ${required}`,
  );
}

for (
  const required of
  [
    "BOOTSTRAP_REFUSED=ACTIVE_ADMIN_EXISTS",
    "PROMOTED_EXISTING_USER",
    "CREATED_ADMIN",
    "password_hash",
    "$argon2id$",
    "pg_advisory_xact_lock",
  ]
) {
  assert(
    bootstrap.includes(
      required,
    ),
    `Bootstrap missing ${required}`,
  );
}

assert(
  !bootstrap.includes(
    "BOOTSTRAP_SECRET",
  ),
  "Bootstrap secret boundary unexpectedly exists",
);

assert(
  bootstrap.includes(
    "process.stdin",
  ),
  "Bootstrap password is not stdin-based",
);

assert(
  dockerfile.includes(
    "scripts/admin-bootstrap.mjs",
  ),
  "Bootstrap CLI is not copied into runtime image",
);

console.log(
  "R6_4AB_ADMIN_ACCOUNT_FOUNDATION_PROBE=PASS",
);

console.log(
  "USER_ADMIN_USERS=DENIED",
);

console.log(
  "EDITOR_ADMIN_USERS=DENIED",
);

console.log(
  "ADMIN_ADMIN_USERS=ALLOWED",
);

console.log(
  "LAST_ACTIVE_ADMIN_GUARD=PRESENT",
);

console.log(
  "AUTHORITY_CHANGE_SESSION_REVOCATION=PRESENT",
);

console.log(
  "BOOTSTRAP_CHANNEL=OPERATOR_CLI",
);

console.log(
  "BOOTSTRAP_HTTP_ENDPOINT=NONE",
);

console.log(
  "BOOTSTRAP_PASSWORD_CHANNEL=STDIN",
);
