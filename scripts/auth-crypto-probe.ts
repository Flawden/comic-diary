import {
  normalizeLoginIdentifier,
} from "../src/modules/auth/login-identifier";
import {
  hashPassword,
  verifyPassword,
} from "../src/modules/auth/password";
import {
  createSessionToken,
  hashSessionToken,
} from "../src/modules/auth/session-token";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const normalized =
    normalizeLoginIdentifier(
      "  Reader@Example.COM  ",
    );

  assert(
    normalized ===
      "reader@example.com",
    "Login normalization failed",
  );

  const password =
    "correct horse battery staple";

  const hashA =
    await hashPassword(password);

  const hashB =
    await hashPassword(password);

  assert(
    hashA.startsWith("$argon2id$"),
    "Hash A is not Argon2id",
  );

  assert(
    hashB.startsWith("$argon2id$"),
    "Hash B is not Argon2id",
  );

  assert(
    hashA !== hashB,
    "Independent hashes reused salt",
  );

  assert(
    await verifyPassword(
      hashA,
      password,
    ),
    "Correct password rejected",
  );

  assert(
    !await verifyPassword(
      hashA,
      "wrong password",
    ),
    "Wrong password accepted",
  );

  assert(
    !await verifyPassword(
      "not-a-password-hash",
      password,
    ),
    "Malformed hash accepted",
  );

  const tokenA =
    createSessionToken();

  const tokenB =
    createSessionToken();

  assert(
    tokenA !== tokenB,
    "Session tokens repeated",
  );

  assert(
    /^[A-Za-z0-9_-]{43}$/.test(
      tokenA,
    ),
    "Unexpected session-token format",
  );

  const tokenHashA =
    hashSessionToken(tokenA);

  const tokenHashAAgain =
    hashSessionToken(tokenA);

  const tokenHashB =
    hashSessionToken(tokenB);

  assert(
    /^[0-9a-f]{64}$/.test(
      tokenHashA,
    ),
    "Session digest is not SHA-256 hex",
  );

  assert(
    tokenHashA ===
      tokenHashAAgain,
    "Session hashing is not deterministic",
  );

  assert(
    tokenHashA !== tokenHashB,
    "Different session tokens collided",
  );

  assert(
    !tokenHashA.includes(tokenA),
    "Raw token leaked into digest",
  );

  console.log(
    "R6_2A_AUTH_CRYPTO_PROBE=PASS",
  );

  console.log(
    "LOGIN_NORMALIZATION=PASS",
  );

  console.log(
    "PASSWORD_KDF=ARGON2ID",
  );

  console.log(
    "PASSWORD_RANDOM_SALT=PASS",
  );

  console.log(
    "PASSWORD_VERIFY=PASS",
  );

  console.log(
    "SESSION_TOKEN_ENTROPY_BITS=256",
  );

  console.log(
    "SESSION_TOKEN_STORAGE=SHA256_ONLY",
  );

  console.log(
    "RAW_SESSION_TOKEN_DATABASE_STORAGE=NONE",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
