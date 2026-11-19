/** Server-only recovery dispatcher. No public send/receipt/authorization API.
 * The only network path follows a committed, conditional PostgreSQL start.
 * CONTROL -> USER -> TOKEN -> OUTBOX locks serialize the final preflight.
 * Its commit is the authorization point; later OFF/revoke cannot cancel HTTP.
 * A crash after commit sacrifices delivery rather than risks a second attempt.
 */
import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetMailDispatchControl as controlTable, passwordResetMailOutbox as outboxTable, passwordResetTokens, users } from "@/db/schema";
import { claimPendingPasswordResetMailOnce } from "./password-reset-request-outbox-claim";
import { recordPendingRecoveryDispatchFenceOnce } from "./password-reset-request-outbox-fence";
import { reservePendingRecoveryDispatchOnce } from "./password-reset-request-outbox-reserve";
import { preflightClaimedPasswordResetMailDryRun } from "./password-reset-request-outbox-preflight";
import { unsealPasswordResetMailOutboxPayload } from "./password-reset-request-outbox-crypto";
import { buildPasswordResetRecoveryMail } from "./password-reset-request-mail";
import { readRecoveryRequestOutboxKey } from "./password-reset-request-config";
import { prepareRecoveryResendRuntimeCandidate } from "./password-reset-request-resend-runtime-config";
import { bridgeRecoveryResendOutcome } from "./password-reset-request-resend-outcome-bridge";
import { finalizeReservedRecoveryProviderOutcomeOnce } from "./password-reset-request-outbox-finalize-reserved";

type Environment = Readonly<Record<string, string | undefined>>;
type Config = NonNullable<ReturnType<typeof readConfig>>;
type Claim = { outboxId: number; claimId: string };
type Classification = "accepted" | "rejected" | "uncertain";
export type RecoveryDispatchResult = Readonly<{
  status: "disabled" | "no_work" | "blocked" | "recorded" | "not_recorded";
  attempted: boolean;
  classification?: Classification;
}>;
type Http = (url: string, init: RequestInit) => Promise<Response>;
type TestHooks = {
  afterClaim?: () => Promise<void>;
  afterReservation?: () => Promise<void>;
  afterStart?: () => Promise<void>;
  beforeFinalize?: () => Promise<void>;
};
const ENDPOINT = "https://api.resend.com/emails";
const HTTP_TIMEOUT_MS = 10_000;
const BLOCKED: RecoveryDispatchResult = Object.freeze({ status: "blocked", attempted: false });

function readConfig(env: Environment) {
  if (env.AUTH_RECOVERY_DISPATCH_ENABLED !== "true" || env.AUTH_RECOVERY_SENDER_VERIFIED !== "true" ||
      env.PASSWORD_RESET_REDEEM_ENABLED !== "true") return null;
  const sender = prepareRecoveryResendRuntimeCandidate(env);
  if (!sender || sender.publicOrigin !== env.COMIC_DIARY_PUBLIC_ORIGIN) return null;
  const key = readRecoveryRequestOutboxKey(env);
  return key ? { ...sender, key, keys: new Map([[key.keyId, key.bytes]]) } : null;
}

/** Production entrypoint accepts NO caller-supplied job, payload or permit. */
export async function dispatchNextPasswordResetMail(...unexpected: unknown[]): Promise<RecoveryDispatchResult> {
  if (unexpected.length) return BLOCKED;
  return dispatch(process.env, (url, init) => fetch(url, init));
}

/** Test seam cannot be selected by the production entrypoint or environment.
 * The function is inaccessible outside NODE_ENV=test; no mock fallback exists.
 */
export async function dispatchPasswordResetMailForTest(input: {
  env: Environment; http: Http; hooks?: TestHooks;
}): Promise<RecoveryDispatchResult> {
  if (process.env.NODE_ENV !== "test" || !input ||
      Object.keys(input).some(key => !["env", "http", "hooks"].includes(key)) ||
      typeof input.http !== "function") return BLOCKED;
  return dispatch(input.env, input.http, input.hooks);
}

async function dispatch(env: Environment, http: Http, hooks: TestHooks = {}): Promise<RecoveryDispatchResult> {
  const config = readConfig(env);
  if (!config) return { status: "disabled", attempted: false };
  let attempted = false;
  let classification: Classification | undefined;
  try {
    // Do not consume work while the persisted operator gate is OFF.
    const [gate] = await db.select().from(controlTable).where(eq(controlTable.id, 1));
    if (!gate?.enabled) return BLOCKED;
    const claim = await claimPendingPasswordResetMailOnce();
    if (!claim.ok) return { status: "no_work", attempted: false };
    await hooks.afterClaim?.();
    const binding = { outboxId: claim.outboxId, claimId: claim.claimId,
      expectedPublicOrigin: config.publicOrigin, keys: config.keys };
    const fence = await recordPendingRecoveryDispatchFenceOnce({ ...binding, operatorFenceEnabled: true });
    if (!fence.ok) return BLOCKED;
    const reserved = await reservePendingRecoveryDispatchOnce(binding);
    if (!reserved.ok) return BLOCKED;
    await hooks.afterReservation?.();
    const start = await beginDispatch(claim, config);
    if (!start) return BLOCKED;
    await hooks.afterStart?.();
    // A paused/crashed worker must not use a stale handoff on resumption.
    if (Date.now() - start.startedAt.getTime() > 15_000 || start.expiresAt.getTime() - Date.now() <= 60_000) return BLOCKED;
    attempted = true;
    classification = await submitOnce(start.body, start.idempotencyKey, config.apiKey, http);
    const bridged = bridgeRecoveryResendOutcome({ attempted: true, classification,
      sendAuthorized: false, retryAuthorized: false });
    if (!bridged.eligible) return { status: "not_recorded", attempted, classification };
    await hooks.beforeFinalize?.();
    const result = await finalizeReservedRecoveryProviderOutcomeOnce({ outboxId: claim.outboxId, claimId: claim.claimId,
      reservationGeneration: start.generation, evidence: bridged.evidence });
    return { status: result.ok ? "recorded" : "not_recorded", attempted, classification };
  } catch {
    // Never expose SQL, credentials, recipient, token or provider response.
    return attempted ? { status: "not_recorded", attempted, classification: classification ?? "uncertain" } : BLOCKED;
  } finally { config.key.bytes.fill(0); }
}

/** Private: this is not callable with a forged external authorization object.
 * No HTTP occurs in this transaction. Commit acknowledgement is required.
 */
async function beginDispatch(claim: Claim, config: Config) {
  const [candidate] = await db.select({ userId: passwordResetTokens.userId, tokenId: passwordResetTokens.id })
    .from(outboxTable).innerJoin(passwordResetTokens, eq(outboxTable.passwordResetTokenId, passwordResetTokens.id))
    .where(eq(outboxTable.id, claim.outboxId));
  if (!candidate) return null;
  return db.transaction(async tx => {
    const [control] = await tx.select().from(controlTable).where(eq(controlTable.id, 1)).for("update");
    if (!control?.enabled) return null;
    const [account] = await tx.select().from(users).where(eq(users.id, candidate.userId)).for("update");
    const [token] = await tx.select().from(passwordResetTokens).where(eq(passwordResetTokens.id, candidate.tokenId)).for("update");
    const [outbox] = await tx.select().from(outboxTable).where(eq(outboxTable.id, claim.outboxId)).for("update");
    if (!account || !token || !outbox || outbox.dispatchStartedAt !== null ||
        !outbox.dispatchFenceAt || !outbox.dispatchReservationAt ||
        outbox.dispatchReservationGeneration !== control.generation) return null;
    const now = new Date();
    const preflight = preflightClaimedPasswordResetMailDryRun({ snapshot: { account, token, outbox },
      claimId: claim.claimId, expectedPublicOrigin: config.publicOrigin,
      operatorDryRunEnabled: control.enabled, keys: config.keys, now });
    if (preflight.status !== "eligible_snapshot") return null;
    const payload = unsealPasswordResetMailOutboxPayload({ payloadCiphertext: outbox.payloadCiphertext,
      payloadNonce: outbox.payloadNonce, payloadKeyId: outbox.payloadKeyId, payloadDigest: outbox.payloadDigest },
    { passwordResetTokenId: token.id, idempotencyKey: outbox.idempotencyKey, expiresAt: token.expiresAt }, config.keys, now);
    if (!payload) return null;
    const mail = buildPasswordResetRecoveryMail({ verifiedEmail: payload.email, token: payload.token,
      publicOrigin: payload.publicOrigin, expiresAt: token.expiresAt }, now);
    if (!mail) return null;
    // Serialize a fresh literal of validated primitives BEFORE committing start.
    // Neither caller objects nor toJSON hooks can enter this body.
    const body = JSON.stringify({ from: config.fromAddress, to: [mail.to], subject: mail.subject, text: mail.text });
    const changed = await tx.update(outboxTable).set({ dispatchStartedAt: now, updatedAt: now }).where(and(
      eq(outboxTable.id, claim.outboxId), eq(outboxTable.claimId, claim.claimId),
      eq(outboxTable.state, "in_flight"), eq(outboxTable.passwordResetTokenId, token.id),
      eq(outboxTable.dispatchReservationGeneration, control.generation),
      eq(outboxTable.payloadDigest, outbox.payloadDigest), eq(outboxTable.idempotencyKey, outbox.idempotencyKey),
      isNull(outboxTable.dispatchStartedAt), isNull(outboxTable.finalizedAt),
    )).returning({ id: outboxTable.id });
    return changed.length === 1 ? { body, idempotencyKey: outbox.idempotencyKey,
      startedAt: now, expiresAt: token.expiresAt, generation: control.generation } : null;
  });
}

/** One POST, fixed endpoint, no redirects/retries; whole exchange is bounded.
 * A request accepted by the provider is not evidence of mailbox delivery.
 */
async function submitOnce(body: string, idempotencyKey: string, apiKey: string, http: Http): Promise<Classification> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    return await Promise.race([
      (async (): Promise<Classification> => {
        const response = await http(ENDPOINT, { method: "POST", redirect: "error", cache: "no-store",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
          body, signal: abort.signal });
        if ([400, 401, 403, 404, 422].includes(response.status)) { await response.body?.cancel(); return "rejected"; }
        if (response.status !== 200 && response.status !== 201) { await response.body?.cancel(); return "uncertain"; }
        if (!response.body) return "uncertain";
        reader = response.body.getReader();
        let size = 0;
        const chunks: Buffer[] = [];
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 4096) { await reader.cancel(); return "uncertain"; }
          chunks.push(Buffer.from(part.value));
        }
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).join() !== "id") return "uncertain";
        const id = (parsed as { id: unknown }).id;
        return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? "accepted" : "uncertain";
      })(),
      new Promise<Classification>(resolve => { timer = setTimeout(() => { abort.abort(); void reader?.cancel().catch(() => {}); resolve("uncertain"); }, HTTP_TIMEOUT_MS); }),
    ]);
  } catch { return "uncertain"; }
  finally { if (timer) clearTimeout(timer); abort.abort(); }
}

/** Stale ownership is terminalized without any network or requeue, including
 * claims with no start marker. The accepted policy forbids recycling in_flight.
 * This can lose an email BEFORE HTTP; see the runbook's recovery decision.
 * A lost provider response cannot be reconstructed as accepted/rejected either.
 */
export async function recoverAbandonedPasswordResetDispatches(): Promise<number> {
  const cutoff = new Date(Date.now() - 5 * 60_000);
  // The same live-row predicate is used for discovery AND conditional UPDATE.
  // A start may commit while recovery waits for CONTROL; never reuse its snapshot.
  const abandoned = or(
    and(isNull(outboxTable.dispatchStartedAt), lte(outboxTable.claimedAt, cutoff)),
    and(isNotNull(outboxTable.dispatchStartedAt), lte(outboxTable.dispatchStartedAt, cutoff)),
  );
  const candidates = await db.select({ id: outboxTable.id, userId: passwordResetTokens.userId, tokenId: passwordResetTokens.id })
    .from(outboxTable).innerJoin(passwordResetTokens, eq(outboxTable.passwordResetTokenId, passwordResetTokens.id))
    .where(and(eq(outboxTable.state, "in_flight"), abandoned)).limit(100);
  let recovered = 0;
  for (const item of candidates) {
    recovered += await db.transaction(async tx => {
      await tx.select().from(controlTable).where(eq(controlTable.id, 1)).for("update");
      await tx.select({ id: users.id }).from(users).where(eq(users.id, item.userId)).for("update");
      await tx.select({ id: passwordResetTokens.id }).from(passwordResetTokens).where(eq(passwordResetTokens.id, item.tokenId)).for("update");
      const rows = await tx.update(outboxTable).set({ state: "uncertain", finalizedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(outboxTable.id, item.id), eq(outboxTable.state, "in_flight"), abandoned))
        .returning({ id: outboxTable.id });
      return rows.length;
    });
  }
  return recovered;
}

/** Started only by the explicit server worker flag. Each process drains at
 * most ten jobs per tick; PostgreSQL claims serialize across all processes.
 */
export function startPasswordResetWorker(): void {
  if (process.env.AUTH_RECOVERY_WORKER_ENABLED !== "true") return;
  const runtime = globalThis as typeof globalThis & { __recoveryWorker?: ReturnType<typeof setInterval> };
  if (runtime.__recoveryWorker) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      // Missing provider configuration must not even open a DB connection.
      const config = readConfig(process.env);
      if (!config) return;
      config.key.bytes.fill(0);
      await recoverAbandonedPasswordResetDispatches();
      for (let i = 0; i < 10; i++) {
        const result = await dispatchNextPasswordResetMail();
        if (result.status !== "recorded") break;
      }
    } catch { console.error("Recovery worker unavailable"); }
    finally { busy = false; }
  };
  runtime.__recoveryWorker = setInterval(() => { void tick(); }, 10_000);
  runtime.__recoveryWorker.unref();
  void tick();
}
