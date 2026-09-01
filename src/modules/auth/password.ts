import {
  hash,
  verify,
} from "@node-rs/argon2";

const PASSWORD_HASH_PREFIX =
  "$argon2id$";

const MAX_PASSWORD_BYTES =
  1024;

function assertPasswordInput(
  password: string,
): void {
  const bytes =
    Buffer.byteLength(
      password,
      "utf8",
    );

  if (bytes === 0) {
    throw new Error(
      "Password must not be empty",
    );
  }

  if (bytes > MAX_PASSWORD_BYTES) {
    throw new Error(
      "Password is too long",
    );
  }
}

export async function hashPassword(
  password: string,
): Promise<string> {
  assertPasswordInput(password);

  /*
   * @node-rs/argon2 2.1.0 defaults to
   * Argon2id and emits a PHC-formatted
   * encoded hash containing its salt and
   * work parameters.
   */
  const passwordHash =
    await hash(password, {
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      outputLen: 32,
    });

  if (
    !passwordHash.startsWith(
      PASSWORD_HASH_PREFIX,
    )
  ) {
    throw new Error(
      "Password hash is not Argon2id",
    );
  }

  return passwordHash;
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  if (
    !passwordHash.startsWith(
      PASSWORD_HASH_PREFIX,
    )
  ) {
    return false;
  }

  if (
    Buffer.byteLength(
      password,
      "utf8",
    ) > MAX_PASSWORD_BYTES
  ) {
    return false;
  }

  try {
    return await verify(
      passwordHash,
      password,
    );
  } catch {
    return false;
  }
}
