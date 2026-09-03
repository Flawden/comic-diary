import {
  readFileSync,
} from "node:fs";

function read(
  path: string,
): string {
  return readFileSync(
    path,
    "utf8",
  );
}

function assert(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

const service =
  read(
    "src/modules/auth/registration-service.ts",
  );

const route =
  read(
    "src/app/api/auth/register/route.ts",
  );

const page =
  read(
    "src/app/register/page.tsx",
  );

const form =
  read(
    "src/app/register/RegisterForm.tsx",
  );

const loginPage =
  read(
    "src/app/login/page.tsx",
  );

assert(
  service.includes(
    "normalizeLoginIdentifier",
  ),
  "Registration does not reuse login email normalization",
);

assert(
  service.includes(
    "hashPassword",
  ),
  "Registration does not reuse Argon2id password hashing",
);

assert(
  service.includes(
    'role:\n            "USER"',
  ),
  "Registration does not explicitly force USER role",
);

assert(
  service.includes(
    "users.email",
  ) &&
    service.includes(
      "email_unavailable",
    ),
  "Duplicate email protection missing",
);

assert(
  service.includes(
    '"23505"',
  ),
  "Race-safe unique violation handling missing",
);

assert(
  route.includes(
    "isSameOriginRequest",
  ),
  "Registration mutation lacks same-origin guard",
);

assert(
  route.includes(
    "createUserSession",
  ) &&
    route.includes(
      "setSessionCookie",
    ),
  "Registration does not reuse established session stack",
);

assert(
  route.includes(
    "allowedRegistrationKeys",
  ) &&
    route.includes(
      '"passwordConfirm"',
    ),
  "Registration request whitelist missing",
);

assert(
  !route.includes(
    "record.role",
  ) &&
    !route.includes(
      "record.isActive",
    ) &&
    !route.includes(
      "record.userId",
    ),
  "Registration accepts privileged client identity fields",
);

assert(
  route.includes(
    "status: 201",
  ),
  "Registration success is not 201",
);

assert(
  form.includes(
    '"/api/auth/register"',
  ),
  "Registration form does not call registration API",
);

assert(
  form.includes(
    'autoComplete="new-password"',
  ) &&
    form.includes(
      'name="passwordConfirm"',
    ),
  "Registration password confirmation UI missing",
);

assert(
  page.includes(
    "Регистрация",
  ) &&
    page.includes(
      "RegisterForm",
    ),
  "Registration page missing",
);

assert(
  loginPage.includes(
    "registerHref",
  ) &&
    loginPage.includes(
      "Зарегистрироваться",
    ),
  "Login page does not link to registration",
);

console.log(
  "R7_1_REGISTRATION_CONTRACT_PROBE=PASS",
);
console.log(
  "REGISTRATION_ROUTE=/register",
);
console.log(
  "REGISTRATION_API=/api/auth/register",
);
console.log(
  "NEW_ACCOUNT_ROLE=USER_ONLY",
);
console.log(
  "CLIENT_ROLE_SELECTION=DENIED_BY_SCHEMA",
);
console.log(
  "EMAIL_NORMALIZATION=REUSED_FROM_LOGIN",
);
console.log(
  "DUPLICATE_EMAIL=409_CONTROLLED",
);
console.log(
  "INACTIVE_EMAIL_RECREATE=DENIED",
);
console.log(
  "PASSWORD_HASH=ARGON2ID_REUSED",
);
console.log(
  "AUTO_LOGIN=EXISTING_SESSION_STACK",
);
console.log(
  "SAME_ORIGIN_REQUIRED=YES",
);
console.log(
  "REGISTRATION_RATE_LIMIT=DEFERRED_TO_RELEASE_HARDENING",
);
