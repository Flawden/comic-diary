/**
 * AUTH-01C2B4D2B2A: Resend wire-contract CANDIDATE, not a sender.
 *
 * Pure request-body construction and reply classification only. No fetch, no
 * credentials, no environment reads, no retry, no logging and no side effects.
 * The integrated worker uses this pure contract after a committed DB start.
 * Domain verification is an operator deployment prerequisite, not code authority.
 * D2C4B2: accept the SAME persisted 24-byte base64url outbox issuance key
 * created by D2C3. Do not mint, derive, truncate, or prefix a second key.
 * This does not permit delivery or any retries of uncertain outcomes.
 */
import type { PendingActivationMail } from "./registration-activation-mail";
// @ts-expect-error TS5097: Node strip-types needs .ts; CI uses tsx.
import { prepareActivationSenderEnvelope, type ActivationSenderConfiguration } from "./registration-activation-sender.ts";

export type ResendCandidatePayload = Readonly<{
  from: string;
  to: readonly [string];
  subject: string;
  text: string;
}>;

export type ResendCandidateRequest = Readonly<{
  endpoint: "https://api.resend.com/emails";
  method: "POST";
  /** Canonical persisted 192-bit random value from D2C3; one per issuance. */
  idempotencyKey: string;
  payload: ResendCandidatePayload;
}>;

/**
 * D2C3 stores 24 random bytes (32 canonical base64url chars) for each outbox
 * issuance. Resend accepts 1..256-character Idempotency-Key values; we
 * preserve the exact persisted key, instead of manufacturing a second ID.
 * The format cannot prove randomness; ONLY trust a key from the atomic issuer.
 * A provider idempotency window is NOT permanent deduplication. Never retry
 * an uncertain provider outcome automatically. This module creates no keys.
 */
function validOpaqueRequestKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(value)) return false;
  const bytes = Buffer.from(value, "base64url");
  return bytes.length === 24 && bytes.toString("base64url") === value;
}

export function prepareResendActivationCandidate(
  config: ActivationSenderConfiguration,
  message: PendingActivationMail,
  idempotencyKey: string,
): ResendCandidateRequest | null {
  if (!validOpaqueRequestKey(idempotencyKey)) return null;
  const envelope = prepareActivationSenderEnvelope(config, message);
  if (!envelope) return null;
  const payload: ResendCandidatePayload = Object.freeze({
    from: envelope.from,
    to: Object.freeze([envelope.to]) as readonly [string],
    subject: envelope.subject,
    text: envelope.text,
  });
  return Object.freeze({
    endpoint: "https://api.resend.com/emails" as const,
    method: "POST" as const,
    idempotencyKey,
    payload,
  });
}

/**
 * Strict interpretation of the raw API response; no provider response content
 * is propagated to a route, log or user. This is NOT evidence of inbox delivery.
 *
 * 'uncertain' includes lost response/timeouts, 409 concurrent/conflicting
 * requests, 429 and 5xx. No automatic retry is authorized by this classifier.
 */
export type ResendCandidateReply = "accepted" | "rejected" | "uncertain";
export function classifyResendCandidateReply(
  status: number | undefined,
  body: unknown,
): ResendCandidateReply {
  if (status === undefined || !Number.isInteger(status) || status < 100 || status > 599) {
    return "uncertain";
  }
  if (status === 200 || status === 201) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return "uncertain";
    const data = body as Record<string, unknown>;
    // The raw POST /emails response contains a single provider message id.
    // Never surface that id in auth public APIs or user-visible logs.
    if (Object.keys(data).length !== 1 || typeof data.id !== "string") return "uncertain";
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)
      ? "accepted"
      : "uncertain";
  }
  // Explicit request/client errors with a clear negative provider response.
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
    return "rejected";
  }
  return "uncertain";
}
