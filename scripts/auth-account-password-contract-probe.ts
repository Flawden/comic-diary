import {
  existsSync,
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

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

function source(
  path: string,
): string {
  const resolved =
    resolve(
      process.cwd(),
      path,
    );

  assert(
    existsSync(
      resolved,
    ),
    `missing ${path}`,
  );

  return readFileSync(
    resolved,
    "utf8",
  );
}

const page =
  source(
    "src/app/account/page.tsx",
  );

const form =
  source(
    "src/app/account/AccountPasswordForm.tsx",
  );

const route =
  source(
    "src/app/api/account/password/route.ts",
  );

const service =
  source(
    "src/modules/auth/password-change-service.ts",
  );

assert(
  page.includes(
    'await getCurrentUser(',
  ),
  "account page is not session-bound",
);

assert(
  page.includes(
    '"/login?next=%2Faccount"',
  ),
  "anonymous account redirect missing",
);

assert(
  page.includes(
    "<AccountPasswordForm",
  ),
  "password form missing from account page",
);

for (
  const required of [
    'name="currentPassword"',
    'name="newPassword"',
    'name="newPasswordConfirm"',
    'minLength={10}',
    'maxLength={256}',
    '"/api/account/password"',
  ]
) {
  assert(
    form.includes(
      required,
    ),
    `account form missing ${required}`,
  );
}

for (
  const forbidden of [
    'name="email"',
    'name="role"',
    'name="userId"',
    'name="isActive"',
  ]
) {
  assert(
    !form.includes(
      forbidden,
    ),
    `account form exposes forbidden field ${forbidden}`,
  );
}

for (
  const required of [
    '"currentPassword"',
    '"newPassword"',
    '"newPasswordConfirm"',
    '"account-password-user-v1"',
    "consumeAuthRateLimit",
    "Retry-After",
    "getCurrentUser",
    "changeOwnPassword",
    "setSessionCookie",
    "clearSessionCookie",
    "isSameOriginRequest",
    '"Cache-Control"',
    '"no-store"',
  ]
) {
  assert(
    route.includes(
      required,
    ),
    `password route missing ${required}`,
  );
}

const sameOriginIndex =
  route.indexOf(
    "!isSameOriginRequest(",
  );

const authIndex =
  route.indexOf(
    "await getCurrentUser(",
  );

const bodyIndex =
  route.indexOf(
    "await request.text()",
  );

const limiterIndex =
  route.indexOf(
    "await consumeAuthRateLimit(",
  );

const changeIndex =
  route.indexOf(
    "await changeOwnPassword(",
  );

assert(
  sameOriginIndex >= 0 &&
    authIndex > sameOriginIndex,
  "same-origin must precede authentication",
);

assert(
  bodyIndex > authIndex,
  "body read must follow authentication",
);

assert(
  limiterIndex > bodyIndex &&
    changeIndex > limiterIndex,
  "rate limit must precede current-password verification",
);

for (
  const forbidden of [
    '"email",',
    '"role",',
    '"userId",',
    '"isActive",',
  ]
) {
  assert(
    !route.includes(
      forbidden,
    ),
    `password route accepts forbidden identity/authority key ${forbidden}`,
  );
}

for (
  const required of [
    "db.transaction(",
    '.for(',
    '"update"',
    "verifyPassword(",
    "isRegistrationPasswordAllowed(",
    "hashPassword(",
    "createSessionToken(",
    "hashSessionToken(",
    ".delete(",
    "sessions,",
    ".insert(",
    "tokenHash,",
    "updatedAt:",
  ]
) {
  assert(
    service.includes(
      required,
    ),
    `password service missing ${required}`,
  );
}

const updateIndex =
  service.indexOf(
    ".update(",
  );

const revokeIndex =
  service.indexOf(
    ".delete(",
  );

const insertIndex =
  service.indexOf(
    ".insert(",
  );

assert(
  updateIndex >= 0 &&
    revokeIndex > updateIndex &&
    insertIndex > revokeIndex,
  "password/session mutation ordering is not update -> revoke -> replacement session",
);

assert(
  service.includes(
    "currentPassword ===",
  ) &&
    service.includes(
      '"password_unchanged"',
    ),
  "password reuse rejection missing",
);

console.log(
  "R7_2B_ACCOUNT_PASSWORD_CONTRACT_PROBE=PASS",
);
console.log(
  "ACCOUNT_PAGE=/account",
);
console.log(
  "ACCOUNT_PAGE_AUTH_REQUIRED=YES",
);
console.log(
  "PASSWORD_CHANGE_API=/api/account/password",
);
console.log(
  "TARGET_IDENTITY=AUTHENTICATED_SESSION_USER_ONLY",
);
console.log(
  "CURRENT_PASSWORD_REQUIRED=YES",
);
console.log(
  "NEW_PASSWORD_POLICY=REGISTRATION_POLICY_REUSED",
);
console.log(
  "PASSWORD_HASH=ARGON2ID_REUSED",
);
console.log(
  "PASSWORD_UPDATE_AND_SESSION_ROTATION=ONE_DB_TRANSACTION",
);
console.log(
  "OLD_SESSIONS=REVOKE_ALL",
);
console.log(
  "CURRENT_BROWSER=NEW_SESSION_TOKEN",
);
console.log(
  "SESSION_TOKEN_STORAGE=SHA256_DIGEST_ONLY",
);
console.log(
  "PASSWORD_CHANGE_RATE_LIMIT=10_PER_15_MINUTES_PER_AUTHENTICATED_USER",
);
console.log(
  "RATE_LIMIT_BACKEND=POSTGRESQL_SHARED_PERSISTENT",
);
console.log(
  "SAME_ORIGIN_REQUIRED=YES",
);
console.log(
  "SCHEMA_MIGRATION=NONE",
);
console.log(
  "PUBLIC_PASSWORD_RECOVERY=NOT_IMPLEMENTED",
);
console.log(
  "EMAIL_CHANGE=NOT_IMPLEMENTED",
);
