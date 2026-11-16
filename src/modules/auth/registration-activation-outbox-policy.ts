/**
 * AUTH-01C2B4D2B2B: INERT outbox outcome policy (no database, no transport).
 *
 * This reducer describes allowed status transitions for ONE immutable
 * activation-email issuance. It is not a delivery implementation or a lock.
 * Before using it to dispatch anything, a future DB-backed outbox MUST atomically
 * persist a claim, an independent idempotency key, an immutable payload digest,
 * expiry and attempt count, and ensure two workers cannot claim the same item.
 *
 * Never automatically retry an ambiguous provider result, release a new code,
 * reuse a recipient-owned idempotency key, or report inbox delivery.
 */

import type { ResendCandidateReply } from "./registration-activation-resend-contract";

export type ActivationOutboxState =
  | "ready"         // Persisted immutable item, not yet claimed.
  | "in_flight"     // Durable exclusive claim MUST already exist in DB.
  | "accepted"      // Provider accepted submission; NOT inbox delivery.
  | "rejected"      // Provider explicitly rejected the submission.
  | "uncertain"     // Timeout/409/429/5xx or lost response: manual reconciliation.
  | "expired";      // Unclaimed token expired; no dispatch allowed.

export type ActivationOutboxEvent =
  | Readonly<{ kind: "claimed"; now: Date; expiresAt: Date }>
  | Readonly<{ kind: "provider_result"; result: ResendCandidateReply }>
  | Readonly<{ kind: "transport_error" }>
  | Readonly<{ kind: "expired"; now: Date; expiresAt: Date }>;

const STATES = new Set<ActivationOutboxState>([
  "ready", "in_flight", "accepted", "rejected", "uncertain", "expired",
]);

function exactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, i) => key === [...keys].sort()[i]);
}

function validTimes(now: unknown, expiresAt: unknown): { nowMs: number; expiresMs: number } | null {
  if (!(now instanceof Date) || !(expiresAt instanceof Date)) return null;
  const nowMs = now.getTime();
  const expiresMs = expiresAt.getTime();
  return Number.isFinite(nowMs) && Number.isFinite(expiresMs) ? { nowMs, expiresMs } : null;
}

/**
 * Fail-closed *policy proposal*, not a DB update or permission to send.
 * null = unsupported transition (must hold for investigation, never retry).
 */
export function deriveActivationOutboxNextState(
  current: ActivationOutboxState,
  event: ActivationOutboxEvent,
): ActivationOutboxState | null {
  if (!STATES.has(current) || !event || typeof event !== "object" || Array.isArray(event)) return null;
  // No terminal state may become ready/in_flight again for the same issuance.
  if (current !== "ready" && current !== "in_flight") return null;

  if (event.kind === "claimed") {
    if (current !== "ready" || !exactKeys(event, ["kind", "now", "expiresAt"])) return null;
    const times = validTimes(event.now, event.expiresAt);
    if (!times) return null;
    const remaining = times.expiresMs - times.nowMs;
    // Same window as mail generation: refuse nearly-expired or implausible tokens.
    return remaining > 60_000 && remaining <= 30 * 60_000 ? "in_flight" : null;
  }

  if (event.kind === "expired") {
    if (current !== "ready" || !exactKeys(event, ["kind", "now", "expiresAt"])) return null;
    const times = validTimes(event.now, event.expiresAt);
    return times && times.nowMs >= times.expiresMs ? "expired" : null;
  }

  if (event.kind === "provider_result") {
    if (current !== "in_flight" || !exactKeys(event, ["kind", "result"])) return null;
    if (event.result === "accepted" || event.result === "rejected" || event.result === "uncertain") {
      return event.result;
    }
    return null;
  }

  if (event.kind === "transport_error") {
    if (current !== "in_flight" || !exactKeys(event, ["kind"])) return null;
    // A thrown error doesn't prove the provider never accepted the message.
    return "uncertain";
  }

  return null;
}
