import { createHash, randomBytes } from "node:crypto";

/** AUTH-01C2B1: crypto-only primitives; no DB, HTTP, session or mail side effects. */
export const EMAIL_VERIFICATION_TOKEN_BYTES = 32;
/** Provisional policy: 30-minute window; revisit before public activation. */
export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 30 * 60 * 1000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_DOMAIN = "comic-diary:email-verification:v1\0";

export type IssuedEmailVerificationToken = {
  /** Sensitive. Never log, persist or return in a public JSON response. */
  token: string;
  /** Only the digest is eligible for persistence. */
  tokenHash: string;
  expiresAt: Date;
};

/** Reject malformed and noncanonical base64url representations. */
export function hashEmailVerificationToken(token: unknown): string | null {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    return null;
  }

  const decoded = Buffer.from(token, "base64url");
  if (
    decoded.length !== EMAIL_VERIFICATION_TOKEN_BYTES ||
    decoded.toString("base64url") !== token
  ) {
    return null;
  }

  return createHash("sha256")
    .update(HASH_DOMAIN, "utf8")
    .update(token, "utf8")
    .digest("hex");
}

export function issueEmailVerificationToken(
  now: Date = new Date(),
): IssuedEmailVerificationToken {
  const issuedAt = now.getTime();
  const expiresAtMs = issuedAt + EMAIL_VERIFICATION_TOKEN_TTL_MS;
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(new Date(expiresAtMs).getTime())
  ) {
    throw new Error("Invalid email-verification issuance time");
  }

  const token = randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashEmailVerificationToken(token);
  if (!tokenHash) {
    throw new Error("Failed to create email-verification token digest");
  }
  return { token, tokenHash, expiresAt: new Date(expiresAtMs) };
}

/** At the expiry instant, a token is already invalid. */
export function isEmailVerificationTokenExpired(
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
