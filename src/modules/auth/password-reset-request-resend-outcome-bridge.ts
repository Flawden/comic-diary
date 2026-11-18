/** AUTH-01 / R1C2C7: INERT provider-result -> durable evidence bridge.
 * No network, database, credentials, mail, retry, worker or operator ON action.
 * Blocked/non-attempted outcomes are not eligible for finalization.
 */
import type { ResendRecoveryResult } from "./password-reset-request-resend-test-adapter";
import type { RecoveryProviderEvidence } from "./password-reset-request-provider-outcome";

export type RecoveryOutcomeBridgeResult = Readonly<
  | { eligible: false; sendAuthorized: false; retryAuthorized: false }
  | { eligible: true; evidence: RecoveryProviderEvidence; sendAuthorized: false; retryAuthorized: false }
>;
const BLOCKED: RecoveryOutcomeBridgeResult = Object.freeze({ eligible: false, sendAuthorized: false, retryAuthorized: false });
const ACCEPTED: RecoveryOutcomeBridgeResult = Object.freeze({ eligible: true, evidence: Object.freeze({ kind: "provider_accepted", acknowledged: true }), sendAuthorized: false, retryAuthorized: false });
const REJECTED: RecoveryOutcomeBridgeResult = Object.freeze({ eligible: true, evidence: Object.freeze({ kind: "provider_rejected", definitivelyNotAccepted: true }), sendAuthorized: false, retryAuthorized: false });
const UNCERTAIN: RecoveryOutcomeBridgeResult = Object.freeze({ eligible: true, evidence: Object.freeze({ kind: "transport_uncertain" }), sendAuthorized: false, retryAuthorized: false });

export function bridgeRecoveryResendOutcome(result: unknown): RecoveryOutcomeBridgeResult {
  if (result === null || typeof result !== "object" || Array.isArray(result) || Object.getPrototypeOf(result) !== Object.prototype) return BLOCKED;
  const keys = Object.keys(result).sort();
  if (keys.length !== 4 || keys.join("|") !== "attempted|classification|retryAuthorized|sendAuthorized") return BLOCKED;
  const r = result as ResendRecoveryResult;
  if (r.sendAuthorized !== false || r.retryAuthorized !== false) return BLOCKED;
  if (r.attempted === false && r.classification === "blocked") return BLOCKED;
  if (r.attempted !== true) return BLOCKED;
  if (r.classification === "accepted") return ACCEPTED;
  if (r.classification === "rejected") return REJECTED;
  if (r.classification === "uncertain") return UNCERTAIN;
  return BLOCKED;
}
