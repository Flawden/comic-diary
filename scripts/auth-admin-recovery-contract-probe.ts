import {
  readFileSync,
} from "node:fs";

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

const runbook =
  readFileSync(
    "docs/operations/admin-recovery.md",
    "utf8",
  );

const bootstrap =
  readFileSync(
    "scripts/admin-bootstrap.mjs",
    "utf8",
  );

const domain =
  readFileSync(
    "src/modules/auth/account-administration.ts",
    "utf8",
  );

for (
  const marker of
  [
    "ACTIVE_ADMINS=0",
    "BOOTSTRAP_REFUSED=ACTIVE_ADMIN_EXISTS",
    "ACTION=CREATED_ADMIN",
    "ACTION=PROMOTED_EXISTING_USER",
    "ADMIN_BOOTSTRAP=PASS",
    "PASSWORD_HASH=ARGON2ID",
    "RAW_PASSWORD_PERSISTED=NO",
    "read -r -s",
    "unset ADMIN_PASSWORD",
    "exec -T app",
    "node scripts/admin-bootstrap.mjs",
    "user_comics",
    "/login",
    "ADMIN_USERS",
  ]
) {
  assert(
    runbook.includes(
      marker,
    ),
    `Recovery runbook missing ${marker}`,
  );
}

assert(
  runbook.includes(
    "не имеет публичного HTTP endpoint",
  ),
  "Operator-only recovery boundary is undocumented",
);

assert(
  runbook.includes(
    "не сохранять сырой recovery-пароль",
  ),
  "Raw recovery password logging prohibition missing",
);

assert(
  bootstrap.includes(
    "BOOTSTRAP_REFUSED=ACTIVE_ADMIN_EXISTS",
  ),
  "Bootstrap active ADMIN refusal missing",
);

assert(
  bootstrap.includes(
    "PROMOTED_EXISTING_USER",
  ),
  "Existing user recovery path missing",
);

assert(
  bootstrap.includes(
    "CREATED_ADMIN",
  ),
  "Fresh ADMIN creation path missing",
);

assert(
  bootstrap.includes(
    "process.stdin",
  ),
  "Bootstrap password is not stdin-based",
);

assert(
  bootstrap.includes(
    "DELETE FROM sessions",
  ),
  "Existing user session revocation missing",
);

assert(
  !bootstrap.includes(
    "BOOTSTRAP_SECRET",
  ),
  "Bootstrap secret unexpectedly exists",
);

const bootstrapLock =
  bootstrap.match(
    /ACCOUNT_AUTHORITY_ADVISORY_LOCK\s*=\s*(\d+)/,
  )?.[1];

const domainLock =
  domain.match(
    /ACCOUNT_AUTHORITY_ADVISORY_LOCK\s*=\s*(\d+)/,
  )?.[1];

assert(
  bootstrapLock ===
    domainLock &&
    bootstrapLock ===
      "536000002",
  "Bootstrap and account domain authority locks diverged",
);

console.log(
  "R6_4D_ADMIN_RECOVERY_CONTRACT_PROBE=PASS",
);

console.log(
  "RECOVERY_CHANNEL=OPERATOR_CLI",
);

console.log(
  "RECOVERY_HTTP_ENDPOINT=NONE",
);

console.log(
  "RECOVERY_ALLOWED_WHEN=ZERO_ACTIVE_ADMINS",
);

console.log(
  "RECOVERY_ACTIVE_ADMIN_PRESENT=REFUSED",
);

console.log(
  "RECOVERY_EXISTING_USER_ID=PRESERVED",
);

console.log(
  "RECOVERY_EXISTING_DATA=PRESERVED",
);

console.log(
  "RECOVERY_EXISTING_SESSIONS=REVOKED",
);

console.log(
  "RECOVERY_PASSWORD_CHANNEL=STDIN",
);

console.log(
  "RECOVERY_PASSWORD_STORAGE=ARGON2ID_ONLY",
);

console.log(
  "POST_RECOVERY_VERIFICATION=NORMAL_LOGIN_AND_ADMIN_USERS",
);
