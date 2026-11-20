// Pure purpose selection. Unknown/missing database purposes never fall back.
// @ts-expect-error TS5097: standalone strip-types contracts require .ts.
import { canIssueEmailVerification, type VerificationAccount } from "./email-verification-policy.ts";
// @ts-expect-error TS5097: standalone strip-types contracts require .ts.
import { getActivationState, needsSecurePendingActivation } from "./registration-activation-policy.ts";
export type VerificationPurpose = "pending_activation" | "legacy_email_verification";
export function isVerificationPurpose(value: unknown): value is VerificationPurpose {
  return value === "pending_activation" || value === "legacy_email_verification";
}
export function canDispatchVerificationPurpose(
  account: VerificationAccount & { verificationRequiredAt: Date | null }, purpose: unknown,
): boolean {
  if (!canIssueEmailVerification(account)) return false;
  if (purpose === "pending_activation") return needsSecurePendingActivation(account);
  return purpose === "legacy_email_verification" && getActivationState(account) === "legacy_unverified";
}
export function legacyVerificationEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.AUTH_LEGACY_EMAIL_VERIFICATION_ENABLED === "true";
}
export function legacyVerificationRequestEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return legacyVerificationEnabled(env) && env.AUTH_LEGACY_EMAIL_VERIFICATION_REQUEST_ENABLED === "true";
}
