/**
 * AUTH-01 / R1C1: strict, provider-independent recovery request configuration.
 * OFF by default; readiness does not authorize dispatch. Keep keys out of logs, DB and HTTP.
 */
import { prepareRecoveryResendRuntimeCandidate } from "./password-reset-request-resend-runtime-config";

export type PasswordResetRequestRuntime = Readonly<{
  PASSWORD_RESET_REQUEST_ENABLED?: string;
  PASSWORD_RESET_REQUEST_MAIL_READY?: string;
  PASSWORD_RESET_OUTBOX_KEY_ID?: string;
  PASSWORD_RESET_OUTBOX_KEY_BASE64?: string;
  COMIC_DIARY_PUBLIC_ORIGIN?: string;
}>;

export type RequestOutboxKey = Readonly<{
  keyId: string;
  bytes: Uint8Array;
}>;

const KEY_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const BASE64_32_BYTES = /^[A-Za-z0-9+/]{43}=$/;

/** Both switches require explicit operator approval; neither enables a sender. */
export function isRecoveryRequestAllowed(config: PasswordResetRequestRuntime): boolean {
  return config.PASSWORD_RESET_REQUEST_ENABLED === "true" &&
    config.PASSWORD_RESET_REQUEST_MAIL_READY === "true";
}

/** Fail closed: canonical base64, exactly 32 random bytes and a safe key id. */
export function readRecoveryRequestOutboxKey(config: PasswordResetRequestRuntime): RequestOutboxKey | null {
  const keyId = config.PASSWORD_RESET_OUTBOX_KEY_ID;
  const encoded = config.PASSWORD_RESET_OUTBOX_KEY_BASE64;
  if (typeof keyId !== "string" || !KEY_ID.test(keyId) ||
      typeof encoded !== "string" || !BASE64_32_BYTES.test(encoded)) return null;
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== encoded) {
    decoded.fill(0);
    return null;
  }
  return { keyId, bytes: decoded };
}

/** UI/API readiness, never a network permit. Secrets stay on the server. */
export function isRecoveryRequestOperational(config: Readonly<Record<string, string | undefined>>): boolean {
  if (!isRecoveryRequestAllowed(config) || config.PASSWORD_RESET_REDEEM_ENABLED !== "true" ||
      config.AUTH_RECOVERY_WORKER_ENABLED !== "true" || config.AUTH_RECOVERY_DISPATCH_ENABLED !== "true" ||
      config.AUTH_RECOVERY_SENDER_VERIFIED !== "true") return false;
  const sender = prepareRecoveryResendRuntimeCandidate(config);
  if (!sender || sender.publicOrigin !== config.COMIC_DIARY_PUBLIC_ORIGIN) return false;
  const key = readRecoveryRequestOutboxKey(config);
  if (!key) return false;
  key.bytes.fill(0);
  return true;
}
