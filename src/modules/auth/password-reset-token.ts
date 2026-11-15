import {
  createHash,
  randomBytes,
} from "node:crypto";

/** Raw password-reset tokens are delivered to the mailbox, never stored in DB. */
export const PASSWORD_RESET_TOKEN_BYTES = 32;
export const PASSWORD_RESET_TOKEN_TTL_MS = 20 * 60 * 1000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Domain separation: the same text must not share a digest with a session token.
const HASH_DOMAIN = "comic-diary:password-reset:v1\0";

export type IssuedPasswordResetToken = {
  /** Sensitive: pass to an email sender; never log or persist this value. */
  token: string;
  /** Persist only this digest in the future recovery-token table. */
  tokenHash: string;
  expiresAt: Date;
};

/** Return null for malformed input rather than hashing arbitrary user data. */
export function hashPasswordResetToken(token: unknown): string | null {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    return null;
  }

  const decoded = Buffer.from(token, "base64url");
  if (
    decoded.length !== PASSWORD_RESET_TOKEN_BYTES ||
    decoded.toString("base64url") !== token
  ) {
    // Reject noncanonical representations of the same bytes.
    return null;
  }

  return createHash("sha256")
    .update(HASH_DOMAIN, "utf8")
    .update(token, "utf8")
    .digest("hex");
}

/** Pure token issuance: NO account changes, DB writes, routes, or email delivery. */
export function issuePasswordResetToken(
  now: Date = new Date(),
): IssuedPasswordResetToken {
  const issuedAt = now.getTime();
  const expiresAtMs = issuedAt + PASSWORD_RESET_TOKEN_TTL_MS;

  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(new Date(expiresAtMs).getTime())
  ) {
    throw new Error("Invalid password-reset issuance time");
  }

  const token = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashPasswordResetToken(token);

  if (!tokenHash) {
    throw new Error("Failed to create password-reset token digest");
  }

  return {
    token,
    tokenHash,
    expiresAt: new Date(expiresAtMs),
  };
}

/** Fail closed for invalid dates and at the exact expiry boundary. */
export function isPasswordResetTokenExpired(
  expiresAt: Date,
  now: Date = new Date(),
): boolean {
  const deadline = expiresAt.getTime();
  const current = now.getTime();

  return (
    !Number.isFinite(deadline) ||
    !Number.isFinite(current) ||
    current >= deadline
  );
}
