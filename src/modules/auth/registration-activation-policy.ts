/**
 * AUTH-01C2B4A: model only. Nothing here changes live login, registration,
 * sessions, roles or email-verification routes. Those changes require C2B4B/C.
 *
 * Historical NULL is NOT a verified mailbox. It merely avoids accidentally
 * locking out old users when a future enforcement layer is introduced.
 */
export type ActivationFacts = {
  isActive: boolean;
  emailVerifiedAt: Date | null;
  verificationRequiredAt: Date | null;
};

export type ActivationState =
  | "legacy_unverified"
  | "pending"
  | "verified"
  | "inactive"
  | "invalid";

function isValidOptionalDate(value: unknown): value is Date | null {
  return value === null || (value instanceof Date && Number.isFinite(value.getTime()));
}

/** Never interpret missing/malformed activation fields as a legacy account. */
export function getActivationState(account: unknown): ActivationState {
  if (typeof account !== "object" || account === null || Array.isArray(account)) {
    return "invalid";
  }
  const fields = account as Record<string, unknown>;
  if (typeof fields.isActive !== "boolean" ||
      !isValidOptionalDate(fields.emailVerifiedAt) ||
      !isValidOptionalDate(fields.verificationRequiredAt)) {
    return "invalid";
  }
  if (!fields.isActive) return "inactive";
  if (fields.emailVerifiedAt !== null) return "verified";
  if (fields.verificationRequiredAt !== null) return "pending";
  return "legacy_unverified";
}

/** Future authorization gate: legacy access preserved, pending never granted. */
export function canUseFullAccountSession(account: unknown): boolean {
  const state = getActivationState(account);
  return state === "verified" || state === "legacy_unverified";
}

/** A pending account must complete ownership verification AND replace its password. */
export function needsSecurePendingActivation(account: unknown): boolean {
  return getActivationState(account) === "pending";
}
