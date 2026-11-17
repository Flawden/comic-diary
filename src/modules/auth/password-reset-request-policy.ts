/**
 * AUTH-01 / R1A: pure eligibility check for future queued recovery requests.
 * An email match is NOT mailbox proof: emailVerifiedAt must already be set.
 * This function must never be used to disclose account existence to clients.
 */
export type RecoveryRequestAccount = Readonly<{
  id: number;
  email: string;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  isActive: boolean;
}>;

export function canQueuePasswordResetForAccount(
  account: RecoveryRequestAccount | null | undefined,
  requestedEmail: string,
): boolean {
  return (
    account !== null &&
    account !== undefined &&
    Number.isSafeInteger(account.id) &&
    account.id > 0 &&
    account.isActive === true &&
    typeof account.passwordHash === "string" &&
    account.passwordHash.length > 0 &&
    account.emailVerifiedAt instanceof Date &&
    Number.isFinite(account.emailVerifiedAt.getTime()) &&
    typeof account.email === "string" &&
    account.email === requestedEmail &&
    /^[^\s@\x00-\x1F\x7F]+@[^\s@\x00-\x1F\x7F]+$/.test(account.email)
  );
}
