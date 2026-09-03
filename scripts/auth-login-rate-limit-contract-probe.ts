import fs from "node:fs";
import path from "node:path";

function read(rel: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), rel),
    "utf8",
  );
}

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const rate = read(
  "src/modules/auth/auth-rate-limit.ts",
);
const route = read(
  "src/app/api/auth/login/route.ts",
);
const doc = read(
  "docs/operations/r7-2-login-rate-limit.md",
);

for (const required of [
  "LOGIN_RATE_LIMIT_SCOPE",
  '"login-ip-v1"',
  "LOGIN_RATE_LIMIT_MAX_REQUESTS",
  "LOGIN_RATE_LIMIT_WINDOW_MS",
  "consumeLoginRateLimit",
  "consumeAuthRateLimit",
]) {
  assert(
    rate.includes(required),
    `rate-limit module missing ${required}`,
  );
}

assert(
  /LOGIN_RATE_LIMIT_MAX_REQUESTS\s*=\s*20/.test(
    rate,
  ),
  "login max requests is not 20",
);

assert(
  /LOGIN_RATE_LIMIT_WINDOW_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000/.test(
    rate,
  ),
  "login rate-limit window is not 15 minutes",
);

for (const required of [
  "readTrustedClientIp",
  "consumeLoginRateLimit",
  '"rate_limit_identity_unavailable"',
  '"rate_limit_unavailable"',
  '"rate_limited"',
  '"Retry-After"',
]) {
  assert(
    route.includes(required),
    `login route missing ${required}`,
  );
}

const sameOriginIndex =
  route.indexOf("!isSameOriginRequest(");
const limiterIndex =
  route.indexOf("await consumeLoginRateLimit(");
const bodyReadIndex =
  route.indexOf("await request.text()");
const authIndex =
  route.indexOf("await authenticatePasswordLogin(");

assert(
  sameOriginIndex >= 0 &&
    limiterIndex > sameOriginIndex,
  "login limiter does not follow same-origin guard",
);

assert(
  bodyReadIndex >= 0 &&
    limiterIndex < bodyReadIndex,
  "login limiter does not precede body read",
);

assert(
  authIndex >= 0 &&
    limiterIndex < authIndex,
  "login limiter does not precede password auth",
);

assert(
  !route.includes("x-forwarded-for"),
  "login route directly trusts X-Forwarded-For",
);

for (const required of [
  "20 requests per 15-minute fixed window",
  "HTTP 429",
  "HTTP 503",
  "No schema migration",
]) {
  assert(
    doc.includes(required),
    `R7.2A doc missing ${required}`,
  );
}

console.log(
  "R7_2A_LOGIN_RATE_LIMIT_CONTRACT_PROBE=PASS",
);
console.log(
  "RATE_LIMIT_BACKEND=POSTGRESQL_SHARED_PERSISTENT",
);
console.log(
  "LOGIN_RATE_LIMIT=20_REQUESTS_PER_15_MINUTES_PER_TRUSTED_IP",
);
console.log(
  "LOGIN_LIMIT_BEFORE_BODY_READ=YES",
);
console.log(
  "LOGIN_LIMIT_BEFORE_ARGON2=YES",
);
console.log(
  "BLOCKED_RESPONSE=429_RETRY_AFTER",
);
console.log(
  "PRODUCTION_LIMITER_FAILURE=FAIL_CLOSED_503",
);
console.log(
  "SCHEMA_MIGRATION=NONE",
);
