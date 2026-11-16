/**
 * AUTH-01C2B2: independent, side-effect-free policy for a trusted internal
 * verification flow. Do not expose either operation as an unauthenticated API.
 */
export type VerificationAccount = {
  id: number;
  email: string;
  passwordHash: string | null;
  isActive: boolean;
  emailVerifiedAt: Date | null;
};

export type VerificationChallenge = {
  id: number;
  userId: number;
  emailSnapshot: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
};

/**
 * Until the historical-accounts policy is approved, only active password
 * accounts with an unverified mailbox may receive a challenge.
 */
export function canIssueEmailVerification(
  account: VerificationAccount | null | undefined,
): boolean {
  return (
    account !== null &&
    account !== undefined &&
    Number.isSafeInteger(account.id) &&
    account.id > 0 &&
    account.isActive === true &&
    typeof account.passwordHash === "string" &&
    account.passwordHash.length > 0 &&
    account.emailVerifiedAt === null &&
    typeof account.email === "string" &&
    account.email.length > 0 &&
    account.email.length <= 320 &&
    /^[^\s@]+@[^\s@]+$/.test(account.email)
  );
}

/**
 * The exact email value must still belong to the SAME account. No lowercase
 * reinterpretation or fuzzy matches are allowed for an issued challenge.
 */
export function canRedeemEmailVerification(
  account: VerificationAccount | null | undefined,
  challenge: VerificationChallenge | null | undefined,
  now: Date,
): boolean {
  if (!canIssueEmailVerification(account) || !account || !challenge) {
    return false;
  }

  const issued = challenge.createdAt?.getTime();
  const expires = challenge.expiresAt?.getTime();
  const current = now?.getTime();

  return (
    Number.isSafeInteger(challenge.id) &&
    challenge.id > 0 &&
    challenge.userId === account.id &&
    challenge.emailSnapshot === account.email &&
    challenge.consumedAt === null &&
    challenge.revokedAt === null &&
    Number.isFinite(issued) &&
    Number.isFinite(expires) &&
    Number.isFinite(current) &&
    issued <= current &&
    current < expires &&
    issued < expires
  );
}
