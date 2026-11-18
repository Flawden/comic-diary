/**
 * AUTH-01 / R1C2C4: INTERNAL durable classification for a PREVIOUSLY RESERVED
 * recovery dispatch. NO sender, provider, HTTP route, worker, network, secrets,
 * mail, retries or operator-ON control. This function only records evidence
 * supplied by a FUTURE, separately reviewed transport adapter.
 *
 * The control row is locked first; finalization deliberately remains possible
 * after OFF (or token expiry) to record the outcome of an earlier reservation.
 * OFF does not cancel past remote activity. Never requeue in_flight/uncertain.
 * A recorded provider `accepted` is NOT proof of mailbox delivery.
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  passwordResetMailDispatchControl,
  passwordResetMailOutbox,
  passwordResetTokens,
  users,
} from "@/db/schema";
import { classifyRecoveryProviderOutcome } from "./password-reset-request-provider-outcome";

export type ReservedRecoveryFinalizeResult = Readonly<
  | { ok: true; recorded: true; classification: "accepted" | "rejected" | "uncertain"; sendAuthorized: false; retryAuthorized: false }
  | { ok: false; kind: "blocked"; sendAuthorized: false; retryAuthorized: false }
>;
const BLOCKED: ReservedRecoveryFinalizeResult = Object.freeze({
  ok: false, kind: "blocked", sendAuthorized: false, retryAuthorized: false,
});
const CLAIM_ID = /^[A-Za-z0-9_-]{32}$/;
function canonicalClaimId(v: unknown): v is string {
  if (typeof v !== "string" || !CLAIM_ID.test(v)) return false;
  const raw = Buffer.from(v, "base64url");
  return raw.length === 24 && raw.toString("base64url") === v;
}

/** Terminal transition only: this method NEVER authorizes calling a provider. */
export async function finalizeReservedRecoveryProviderOutcomeOnce(input: Readonly<{
  outboxId: number;
  claimId: string;
  reservationGeneration: number;
  evidence: unknown;
}>): Promise<ReservedRecoveryFinalizeResult> {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== 4 ||
      !Number.isSafeInteger(input.outboxId) || input.outboxId <= 0 ||
      input.outboxId > 2147483647 || !canonicalClaimId(input.claimId) ||
      !Number.isSafeInteger(input.reservationGeneration) ||
      input.reservationGeneration <= 0 || input.reservationGeneration >= 2147483647) return BLOCKED;

  // Advisory lookup only; ALL authorization-relevant rows are locked below.
  const [candidate] = await db.select({
    tokenId: passwordResetTokens.id,
    userId: passwordResetTokens.userId,
  }).from(passwordResetMailOutbox)
    .innerJoin(passwordResetTokens, eq(passwordResetMailOutbox.passwordResetTokenId, passwordResetTokens.id))
    .where(eq(passwordResetMailOutbox.id, input.outboxId)).limit(1);
  if (!candidate) return BLOCKED;

  return db.transaction(async (tx): Promise<ReservedRecoveryFinalizeResult> => {
    // Same lock order as the reservation: CONTROL -> USER -> TOKEN -> OUTBOX.
    const [control] = await tx.select({ id: passwordResetMailDispatchControl.id })
      .from(passwordResetMailDispatchControl)
      .where(eq(passwordResetMailDispatchControl.id, 1)).limit(1).for("update");
    if (!control) return BLOCKED; // DO NOT require enabled=true: historical outcome must settle.

    const [account] = await tx.select({ id: users.id }).from(users)
      .where(eq(users.id, candidate.userId)).limit(1).for("update");
    const [token] = await tx.select({
      id: passwordResetTokens.id, userId: passwordResetTokens.userId,
    }).from(passwordResetTokens)
      .where(eq(passwordResetTokens.id, candidate.tokenId)).limit(1).for("update");
    const [item] = await tx.select({
      id: passwordResetMailOutbox.id,
      passwordResetTokenId: passwordResetMailOutbox.passwordResetTokenId,
      state: passwordResetMailOutbox.state,
      claimId: passwordResetMailOutbox.claimId,
      attemptCount: passwordResetMailOutbox.attemptCount,
      claimedAt: passwordResetMailOutbox.claimedAt,
      dispatchFenceAt: passwordResetMailOutbox.dispatchFenceAt,
      dispatchReservationAt: passwordResetMailOutbox.dispatchReservationAt,
      dispatchReservationGeneration: passwordResetMailOutbox.dispatchReservationGeneration,
      finalizedAt: passwordResetMailOutbox.finalizedAt,
      createdAt: passwordResetMailOutbox.createdAt,
    }).from(passwordResetMailOutbox)
      .where(eq(passwordResetMailOutbox.id, input.outboxId)).limit(1).for("update");
    if (!account || !token || !item || account.id !== candidate.userId ||
        token.id !== candidate.tokenId || token.userId !== account.id ||
        item.passwordResetTokenId !== token.id || item.state !== "in_flight" ||
        item.claimId !== input.claimId || item.attemptCount !== 1 ||
        item.finalizedAt !== null || !(item.claimedAt instanceof Date) ||
        !(item.dispatchFenceAt instanceof Date) ||
        !(item.dispatchReservationAt instanceof Date) ||
        item.dispatchReservationGeneration !== input.reservationGeneration) return BLOCKED;

    // A malformed/ambiguous provider reply must NOT be misclassified as rejected.
    // Mark it uncertain, never give automatic retry authority.
    const decision = classifyRecoveryProviderOutcome(input.evidence);
    const now = new Date(Math.max(
      Date.now(), item.createdAt.getTime(), item.claimedAt.getTime(),
      item.dispatchFenceAt.getTime(), item.dispatchReservationAt.getTime(),
    ));
    const rows = await tx.update(passwordResetMailOutbox).set({
      state: decision.classification, finalizedAt: now, updatedAt: now,
    }).where(and(
      eq(passwordResetMailOutbox.id, item.id),
      eq(passwordResetMailOutbox.passwordResetTokenId, token.id),
      eq(passwordResetMailOutbox.state, "in_flight"),
      eq(passwordResetMailOutbox.claimId, input.claimId),
      eq(passwordResetMailOutbox.attemptCount, 1),
      eq(passwordResetMailOutbox.dispatchReservationGeneration, input.reservationGeneration),
      isNotNull(passwordResetMailOutbox.dispatchFenceAt),
      isNotNull(passwordResetMailOutbox.dispatchReservationAt),
      isNull(passwordResetMailOutbox.finalizedAt),
    )).returning({ id: passwordResetMailOutbox.id });
    return rows.length === 1
      ? { ok: true, recorded: true, classification: decision.classification,
          sendAuthorized: false, retryAuthorized: false }
      : BLOCKED;
  });
}
