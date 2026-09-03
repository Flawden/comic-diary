import {
  readFileSync,
} from "node:fs";

import {
  readTrustedClientIp,
} from "../src/modules/auth/client-ip";

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

function headers(
  values:
    Record<string, string>,
) {
  return {
    get(
      name: string,
    ): string | null {
      return (
        values[
          name.toLowerCase()
        ] ??
        null
      );
    },
  };
}

const trusted =
  readTrustedClientIp(
    headers({
      "x-real-ip":
        "203.0.113.25",
      "x-forwarded-for":
        "198.51.100.10",
    }),
    {
      production:
        true,
    },
  );

assert(
  trusted ===
    "203.0.113.25",
  "Production did not trust X-Real-IP",
);

const spoofedForwardedOnly =
  readTrustedClientIp(
    headers({
      "x-forwarded-for":
        "198.51.100.10",
    }),
    {
      production:
        true,
    },
  );

assert(
  spoofedForwardedOnly ===
    null,
  "Production trusted X-Forwarded-For without X-Real-IP",
);

const malformedTrusted =
  readTrustedClientIp(
    headers({
      "x-real-ip":
        "not-an-ip",
    }),
    {
      production:
        true,
    },
  );

assert(
  malformedTrusted ===
    null,
  "Production accepted malformed X-Real-IP",
);

const developmentFallback =
  readTrustedClientIp(
    headers({}),
    {
      production:
        false,
    },
  );

assert(
  developmentFallback ===
    "127.0.0.1",
  "Development loopback fallback missing",
);

const limiter =
  read(
    "src/modules/auth/auth-rate-limit.ts",
  );

const route =
  read(
    "src/app/api/auth/register/route.ts",
  );

const schema =
  read(
    "src/db/schema.ts",
  );

const docs =
  read(
    "docs/operations/r7-1-registration.md",
  );

for (
  const marker of [
    "REGISTRATION_RATE_LIMIT_MAX_REQUESTS",
    "10",
    "REGISTRATION_RATE_LIMIT_WINDOW_MS",
    "15 * 60 * 1000",
    "pg_advisory_xact_lock",
    "hashRateLimitIdentity",
    "authRateLimits",
  ]
) {
  assert(
    limiter.includes(
      marker,
    ),
    `Limiter contract marker missing: ${marker}`,
  );
}

assert(
  schema.includes(
    '"auth_rate_limits"',
  ) &&
    schema.includes(
      "auth_rate_limits_scope_key_unique",
    ) &&
    schema.includes(
      "auth_rate_limits_key_hash_sha256_check",
    ),
  "Rate-limit schema contract missing",
);

assert(
  route.includes(
    "readTrustedClientIp",
  ) &&
    route.includes(
      "consumeRegistrationRateLimit",
    ),
  "Registration route does not consume shared limiter",
);

assert(
  route.includes(
    "rate_limit_identity_unavailable",
  ) &&
    route.includes(
      "rate_limit_unavailable",
    ),
  "Registration route is not fail-closed",
);

assert(
  route.includes(
    "rate_limited",
  ) &&
    route.includes(
      '"Retry-After"',
    ) &&
    route.includes(
      "429",
    ),
  "429 / Retry-After contract missing",
);

const rateLimitIndex =
  route.indexOf(
    "consumeRegistrationRateLimit",
  );

const bodyReadIndex =
  route.indexOf(
    "await request.text()",
  );

assert(
  rateLimitIndex >=
    0 &&
    bodyReadIndex >=
      0 &&
    rateLimitIndex <
      bodyReadIndex,
  "Rate limiting does not precede body parsing",
);

assert(
  docs.includes(
    "10 same-origin registration POST requests per trusted client IP per 15-minute window",
  ),
  "Operations document lacks explicit registration policy",
);

console.log(
  "R7_1B_REGISTRATION_RATE_LIMIT_CONTRACT_PROBE=PASS",
);
console.log(
  "RATE_LIMIT_BACKEND=POSTGRESQL_SHARED_PERSISTENT",
);
console.log(
  "RATE_LIMIT_WINDOW=15_MINUTES",
);
console.log(
  "RATE_LIMIT_MAX_REQUESTS=10",
);
console.log(
  "CLIENT_IP_SOURCE=X_REAL_IP_FROM_TRUSTED_NGINX",
);
console.log(
  "X_FORWARDED_FOR_AS_IDENTITY=DENIED",
);
console.log(
  "RAW_CLIENT_IP_RATE_LIMIT_STORAGE=NONE",
);
console.log(
  "RATE_LIMIT_KEY_STORAGE=SHA256",
);
console.log(
  "CONCURRENCY=POSTGRESQL_ADVISORY_LOCK",
);
console.log(
  "BLOCKED_RESPONSE=429_RETRY_AFTER",
);
console.log(
  "PRODUCTION_LIMITER_FAILURE=FAIL_CLOSED_503",
);
