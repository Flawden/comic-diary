/**
 * AUTH-01 / R1C2C6 — inert SERVER-RUNTIME configuration candidate for Resend.
 *
 * This is NOT a delivery switch. It performs no process.env access, I/O,
 * provider requests, logging, retries, DB writes or operator authorization.
 * Passing this preflight NEVER authorizes a mail send. The durable PostgreSQL
 * operator gate and one-shot manual test approval remain separate requirements.
 *
 * Only pass actual server-side environment variables when a reviewed delivery
 * orchestrator is implemented. Never expose this object to browser code.
 */
export type RecoveryResendRuntimeCandidate = Readonly<{
  /** Secret, process memory only. Never log, serialize or return in HTTP. */
  apiKey: string;
  fromAddress: string;
  senderDomain: string;
  publicOrigin: string;
}>;

export type RecoveryResendEnvironment = Readonly<Record<string, string | undefined>>;

const API_KEY = /^re_[A-Za-z0-9_-]{8,248}$/;
const LOCAL_PART = /^[A-Za-z0-9](?:[A-Za-z0-9._+%-]*[A-Za-z0-9])?$/;

function safeDomain(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 4 || value.length > 253 ||
      value !== value.toLowerCase() || !/^[a-z0-9.-]+$/.test(value)) return false;
  const labels = value.split(".");
  return labels.length >= 2 && labels.every((s) =>
    s.length >= 1 && s.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(s)) &&
    (/^[a-z]{2,63}$/.test(labels[labels.length - 1]) ||
      /^xn--[a-z0-9-]{2,59}$/.test(labels[labels.length - 1]));
}

function safeFrom(value: unknown, senderDomain: string): value is string {
  if (typeof value !== "string" || value.length > 254) return false;
  const parts = value.split("@");
  return parts.length === 2 && parts[1] === senderDomain &&
    parts[0].length >= 1 && parts[0].length <= 64 &&
    LOCAL_PART.test(parts[0]) && !parts[0].includes("..");
}

function safeOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value !== value.trim() || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash && url.origin === value;
  } catch { return false; }
}

/**
 * This is only a *configuration candidate*, never permission to send.
 * The explicit flag prevents a partially populated environment from passing.
 * `RESEND_API_KEY` deliberately has no default, fallback or fake token.
 */
export function prepareRecoveryResendRuntimeCandidate(
  env: RecoveryResendEnvironment | null | undefined,
): RecoveryResendRuntimeCandidate | null {
  try {
    if (!env || env.AUTH_RECOVERY_RESEND_CONFIG_READY !== "true") return null;
    const apiKey = env.RESEND_API_KEY;
    const fromAddress = env.AUTH_RECOVERY_FROM_ADDRESS;
    const senderDomain = env.AUTH_RECOVERY_SENDER_DOMAIN;
    const publicOrigin = env.AUTH_RECOVERY_PUBLIC_ORIGIN;
    if (typeof apiKey !== "string" || !API_KEY.test(apiKey) ||
        !safeDomain(senderDomain) || !safeFrom(fromAddress, senderDomain) ||
        !safeOrigin(publicOrigin)) return null;
    return Object.freeze({ apiKey, fromAddress, senderDomain, publicOrigin });
  } catch { return null; }
}
