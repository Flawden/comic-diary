/**
 * AUTH-01 / R1C2A: PURE password-recovery mail-outbox lifecycle proposal.
 * NO DB, claim, encryption, provider, HTTP, retries or sending.
 *
 * The 0040 schema currently permits ONLY ready/expired. In-flight and terminal
 * transitions MUST NOT be used until a separately reviewed migration, durable
 * exclusive claim, token/account revalidation and dispatch permission exist.
 * A provider accepting a request is NOT proof of mailbox delivery.
 */
export type RecoveryOutboxState =
  | "ready" | "in_flight" | "accepted" | "rejected" | "uncertain" | "expired";

export type RecoveryOutboxEvent =
  | Readonly<{ kind: "claimed"; now: Date; expiresAt: Date }>
  | Readonly<{ kind: "expired"; now: Date; expiresAt: Date }>
  | Readonly<{ kind: "invalidated"; now: Date }>
  | Readonly<{ kind: "provider_result"; result: "accepted" | "rejected" | "uncertain" }>
  | Readonly<{ kind: "transport_error" }>;

const STATES = new Set<RecoveryOutboxState>([
  "ready", "in_flight", "accepted", "rejected", "uncertain", "expired",
]);
const RESET_TOKEN_TTL_MS = 20 * 60_000;

function plainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const a = Object.keys(value).sort();
  const b = [...expected].sort();
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

function millis(value: unknown): number | null {
  if (!(value instanceof Date)) return null;
  const time = value.getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Returns a proposed next state only; it does NOT authorize a DB update or send.
 * The future caller MUST hold USER -> TOKEN -> OUTBOX row locks, validate the
 * verified mailbox/token epoch, and persist the exclusive claim before delivery.
 * Never recycle in_flight/uncertain back to ready: provider outcome may be unknown.
 */
export function deriveRecoveryOutboxNextState(
  current: RecoveryOutboxState,
  event: RecoveryOutboxEvent,
): RecoveryOutboxState | null {
  if (!STATES.has(current) || !plainRecord(event)) return null;
  if (current !== "ready" && current !== "in_flight") return null;

  if (event.kind === "claimed") {
    if (current !== "ready" || !exactKeys(event, ["kind", "now", "expiresAt"])) return null;
    const now = millis(event.now);
    const expires = millis(event.expiresAt);
    if (now === null || expires === null) return null;
    const remaining = expires - now;
    return remaining > 60_000 && remaining <= RESET_TOKEN_TTL_MS ? "in_flight" : null;
  }

  if (event.kind === "expired") {
    if (current !== "ready" || !exactKeys(event, ["kind", "now", "expiresAt"])) return null;
    const now = millis(event.now);
    const expires = millis(event.expiresAt);
    return now !== null && expires !== null && now >= expires ? "expired" : null;
  }

  // An already-revoked/consumed token, changed verified mailbox or unavailable
  // account can invalidate a READY item before the clock expiration.
  // A future DB caller must prove that condition while holding row locks.
  if (event.kind === "invalidated") {
    return current === "ready" && exactKeys(event, ["kind", "now"]) && millis(event.now) !== null
      ? "expired" : null;
  }

  if (event.kind === "provider_result") {
    if (current !== "in_flight" || !exactKeys(event, ["kind", "result"])) return null;
    return event.result === "accepted" || event.result === "rejected" || event.result === "uncertain"
      ? event.result : null;
  }

  if (event.kind === "transport_error") {
    // A timeout/exception does not establish that a provider rejected delivery.
    return current === "in_flight" && exactKeys(event, ["kind"]) ? "uncertain" : null;
  }

  return null;
}
