/**
 * AUTH-01 / R1C2C4: provider-neutral OUTCOME CLASSIFIER ONLY.
 * No provider, network, sender, credentials, DB, SMTP, retry or mail content.
 * `accepted` means provider accepted the *request*, not delivered to inbox.
 * Only a positively known non-acceptance is `rejected`; timeout, exception,
 * lost connection, malformed response and all ambiguous outcomes are `uncertain`.
 * A result never authorizes a send, resend or operator-gate transition.
 */
export type RecoveryProviderClassification = "accepted" | "rejected" | "uncertain";
export type RecoveryProviderEvidence =
  | Readonly<{ kind: "provider_accepted"; acknowledged: true }>
  | Readonly<{ kind: "provider_rejected"; definitivelyNotAccepted: true }>
  | Readonly<{ kind: "transport_uncertain" }>;
export type RecoveryProviderDecision = Readonly<{
  classification: RecoveryProviderClassification;
  sendAuthorized: false;
  retryAuthorized: false;
}>;
const ACCEPTED: RecoveryProviderDecision = Object.freeze({
  classification: "accepted", sendAuthorized: false, retryAuthorized: false,
});
const REJECTED: RecoveryProviderDecision = Object.freeze({
  classification: "rejected", sendAuthorized: false, retryAuthorized: false,
});
const UNCERTAIN: RecoveryProviderDecision = Object.freeze({
  classification: "uncertain", sendAuthorized: false, retryAuthorized: false,
});
function exactPlain(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, i) => key === expected[i]);
}
/** Returns no PII, provider response body, raw token or message identifier. */
export function classifyRecoveryProviderOutcome(evidence: unknown): RecoveryProviderDecision {
  try {
    if (!exactPlain(evidence, ["kind"]) &&
        !exactPlain(evidence, ["kind", "acknowledged"]) &&
        !exactPlain(evidence, ["kind", "definitivelyNotAccepted"])) return UNCERTAIN;
    if (exactPlain(evidence, ["kind", "acknowledged"]) &&
        evidence.kind === "provider_accepted" && evidence.acknowledged === true) return ACCEPTED;
    if (exactPlain(evidence, ["kind", "definitivelyNotAccepted"]) &&
        evidence.kind === "provider_rejected" && evidence.definitivelyNotAccepted === true) return REJECTED;
    return UNCERTAIN;
  } catch { return UNCERTAIN; }
}
