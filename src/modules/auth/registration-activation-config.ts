/** Server-only activation readiness. Syntax checks never authorize HTTP. */
import { prepareRecoveryResendRuntimeCandidate } from "./password-reset-request-resend-runtime-config";
import { readRecoveryRequestOutboxKey } from "./password-reset-request-config";
export type ActivationEnvironment = Readonly<Record<string, string | undefined>>;
export function readActivationDispatchConfig(env: ActivationEnvironment) {
  if (env.AUTH_ACTIVATION_DISPATCH_ENABLED !== "true" ||
      env.AUTH_ACTIVATION_SENDER_VERIFIED !== "true" ||
      env.REGISTRATION_ACTIVATION_REDEEM_ENABLED !== "true") return null;
  // Reuse only the strict, side-effect-free syntax validator, with explicit mapping.
  const sender = prepareRecoveryResendRuntimeCandidate({
    AUTH_RECOVERY_RESEND_CONFIG_READY: env.AUTH_ACTIVATION_RESEND_CONFIG_READY,
    RESEND_API_KEY: env.RESEND_API_KEY,
    AUTH_RECOVERY_FROM_ADDRESS: env.AUTH_ACTIVATION_FROM_ADDRESS,
    AUTH_RECOVERY_SENDER_DOMAIN: env.AUTH_ACTIVATION_SENDER_DOMAIN,
    AUTH_RECOVERY_PUBLIC_ORIGIN: env.AUTH_ACTIVATION_PUBLIC_ORIGIN,
  });
  if (!sender || sender.publicOrigin !== env.COMIC_DIARY_PUBLIC_ORIGIN) return null;
  const key = readRecoveryRequestOutboxKey({
    PASSWORD_RESET_OUTBOX_KEY_ID: env.AUTH_ACTIVATION_OUTBOX_KEY_ID,
    PASSWORD_RESET_OUTBOX_KEY_BASE64: env.AUTH_ACTIVATION_OUTBOX_KEY_BASE64,
  });
  return key ? { ...sender, key, keys: new Map([[key.keyId, key.bytes]]) } : null;
}
export function activationDispatchOperational(env: ActivationEnvironment): boolean {
  if (env.AUTH_ACTIVATION_WORKER_ENABLED !== "true") return false;
  const config = readActivationDispatchConfig(env);
  if (!config) return false;
  config.key.bytes.fill(0);
  return true;
}
export function activationRegistrationOperational(env: ActivationEnvironment): boolean {
  return env.REGISTRATION_ENABLED === "true" && activationDispatchOperational(env);
}
