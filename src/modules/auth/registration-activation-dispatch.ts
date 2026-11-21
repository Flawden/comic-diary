/** Server-only activation dispatcher. No public send/receipt/authorization API.
 * The only network path follows a committed, conditional PostgreSQL start.
 * CONTROL -> USER -> TOKEN -> OUTBOX locks serialize the final preflight.
 * Its commit is the authorization point; later OFF/revoke cannot cancel HTTP.
 * A crash after commit sacrifices delivery rather than risks a second attempt.
 */
import { pilotAllowsDispatch } from "./activation-mail-pilot";
import {betaDispatchEnabled,betaPilotCompatible,liveInvitation} from "./beta-invitation-policy";
import {lockBoundInvitation} from "./beta-invitation-state";
import { legacyVerificationEnabled } from "./verification-purpose";
import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { activationMailDispatchControl as controlTable, activationMailOutbox as outboxTable, emailVerificationTokens, users } from "@/db/schema";
import { claimPendingActivationMailOnce, finalizeClaimedActivationMail } from "./registration-activation-outbox-claim";
import { recordPendingActivationDispatchFenceOnce } from "./registration-activation-outbox-fence";
import { reservePendingActivationDispatchOnce } from "./registration-activation-outbox-reserve";
import { preflightClaimedActivationMailDryRun } from "./registration-activation-outbox-dry-run";
import { unsealActivationMailOutboxPayload } from "./registration-activation-outbox-crypto";
import { buildVerificationMail } from "./registration-activation-mail";
import { prepareResendActivationCandidate, classifyResendCandidateReply } from "./registration-activation-resend-contract";
import { readActivationDispatchConfig as readConfig } from "./registration-activation-config";

type Environment = Readonly<Record<string, string | undefined>>;
type Config = NonNullable<ReturnType<typeof readConfig>>;
type Claim = { outboxId: number; claimId: string };
type Classification = "accepted" | "rejected" | "uncertain";
export type ActivationDispatchResult = Readonly<{
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
const BLOCKED: ActivationDispatchResult = Object.freeze({ status: "blocked", attempted: false });

/** Production entrypoint accepts NO caller-supplied job, payload or permit. */
export async function dispatchNextActivationMail(...unexpected: unknown[]): Promise<ActivationDispatchResult> {
  if (unexpected.length) return BLOCKED;
  return dispatch(process.env, (url, init) => fetch(url, init));
}

/** Test seam cannot be selected by the production entrypoint or environment.
 * The function is inaccessible outside NODE_ENV=test; no mock fallback exists.
 */
export async function dispatchActivationMailForTest(input: {
  env: Environment; http: Http; hooks?: TestHooks;
}): Promise<ActivationDispatchResult> {
  if (process.env.NODE_ENV !== "test" || !input ||
      Object.keys(input).some(key => !["env", "http", "hooks"].includes(key)) ||
      typeof input.http !== "function") return BLOCKED;
  return dispatch(input.env, input.http, input.hooks);
}

async function dispatch(env: Environment, http: Http, hooks: TestHooks = {}): Promise<ActivationDispatchResult> {
  const config = readConfig(env);
  if (!config) return { status: "disabled", attempted: false };
  let attempted = false;
  let classification: Classification | undefined;
  try {
    // Do not consume work while the persisted operator gate is OFF.
    const [gate] = await db.select().from(controlTable).where(eq(controlTable.id, 1));
    if (!gate?.enabled) return BLOCKED;
    const claim = await claimPendingActivationMailOnce(legacyVerificationEnabled(env),betaDispatchEnabled(env));
    if (!claim.ok) return { status: "no_work", attempted: false };
    await hooks.afterClaim?.();
    const binding = { outboxId: claim.outboxId, claimId: claim.claimId,
      expectedPublicOrigin: config.publicOrigin, keys: config.keys };
    const fence = await recordPendingActivationDispatchFenceOnce({ ...binding, operatorFenceEnabled: true });
    if (!fence.ok) return BLOCKED;
    const reserved = await reservePendingActivationDispatchOnce(binding);
    if (!reserved.ok) return BLOCKED;
    await hooks.afterReservation?.();
    const start = await beginDispatch(claim, config, legacyVerificationEnabled(env),betaDispatchEnabled(env));
    if (!start) return BLOCKED;
    await hooks.afterStart?.();
    // A paused/crashed worker must not use a stale handoff on resumption.
    if (Date.now() - start.startedAt.getTime() > 15_000 || start.expiresAt.getTime() - Date.now() <= 60_000) return BLOCKED;
    attempted = true;
    classification = await submitOnce(start.body, start.idempotencyKey, config.apiKey, http);
    await hooks.beforeFinalize?.();
    const recorded = await finalizeClaimedActivationMail({ outboxId: claim.outboxId, claimId: claim.claimId, result: classification });
    return { status: recorded ? "recorded" : "not_recorded", attempted, classification };
  } catch {
    // Never expose SQL, credentials, recipient, token or provider response.
    return attempted ? { status: "not_recorded", attempted, classification: classification ?? "uncertain" } : BLOCKED;
  } finally { config.key.bytes.fill(0); }
}

/** Private: this is not callable with a forged external authorization object.
 * No HTTP occurs in this transaction. Commit acknowledgement is required.
 */
async function beginDispatch(claim: Claim, config: Config, legacyEnabled: boolean,betaEnabled:boolean) {
  const [candidate] = await db.select({ userId: emailVerificationTokens.userId, tokenId: emailVerificationTokens.id, invitationId:emailVerificationTokens.invitationId })
    .from(outboxTable).innerJoin(emailVerificationTokens, eq(outboxTable.verificationTokenId, emailVerificationTokens.id))
    .where(eq(outboxTable.id, claim.outboxId));
  if (!candidate) return null;
  return db.transaction(async tx => {
    const [control] = await tx.select().from(controlTable).where(eq(controlTable.id, 1)).for("update");
    if (!control?.enabled) return null;
    const invite=betaEnabled&&betaPilotCompatible(control)?await lockBoundInvitation(tx,candidate.invitationId,candidate.userId):null;
    if(betaEnabled?!invite:candidate.invitationId!==null)return null;
    const [account] = await tx.select().from(users).where(eq(users.id, candidate.userId)).for("update");
    const [token] = await tx.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.id, candidate.tokenId)).for("update");
    const [outbox] = await tx.select().from(outboxTable).where(eq(outboxTable.id, claim.outboxId)).for("update");
    if (!account || !token || !outbox || (token.purpose === "legacy_email_verification" && !legacyEnabled) || outbox.dispatchStartedAt !== null ||
        !outbox.dispatchFenceAt || !outbox.dispatchReservationAt ||
        outbox.dispatchReservationGeneration !== control.generation) return null;
    if(betaEnabled ? (!invite||account.role!=="USER"||token.invitationId!==invite.id||token.purpose!=="pending_activation"||account.email!==invite.email) : !pilotAllowsDispatch(control, account.id, token.purpose, outbox.id))return null;
    const now = new Date();
    if(betaEnabled&&!liveInvitation(invite??undefined,now))return null;
    const preflight = preflightClaimedActivationMailDryRun({ snapshot: { account, token, outbox },
      claimId: claim.claimId, expectedPublicOrigin: config.publicOrigin,
      operatorDryRunEnabled: control.enabled, keys: config.keys, now });
    if (preflight.status !== "eligible_snapshot") return null;
    const payload = unsealActivationMailOutboxPayload({ payloadCiphertext: outbox.payloadCiphertext,
      payloadNonce: outbox.payloadNonce, payloadKeyId: outbox.payloadKeyId, payloadDigest: outbox.payloadDigest },
    { verificationTokenId: token.id, idempotencyKey: outbox.idempotencyKey, expiresAt: token.expiresAt,
      purpose: token.purpose as import("./verification-purpose").VerificationPurpose }, config.keys, now);
    if (!payload) return null;
    const mail = buildVerificationMail(payload, token.purpose, now);
    if (!mail) return null;
    // Serialize a fresh literal of validated primitives BEFORE committing start.
    // Neither caller objects nor toJSON hooks can enter this body.
    const wire = prepareResendActivationCandidate(config, mail, outbox.idempotencyKey, token.purpose);
    if (!wire) return null;
    const body = JSON.stringify({ from: wire.payload.from, to: [wire.payload.to[0]], subject: wire.payload.subject, text: wire.payload.text });
    if (control.pilotId !== null && !betaEnabled) {
      const spent = await tx.update(controlTable).set({ pilotDispatchUsedAt: now }).where(and(
        eq(controlTable.id, 1), eq(controlTable.pilotId, control.pilotId), eq(controlTable.pilotUserId, 1),
        eq(controlTable.pilotOutboxId, outbox.id), isNull(controlTable.pilotDispatchUsedAt), isNull(controlTable.pilotClosedAt),
        eq(controlTable.enabled, true), eq(controlTable.generation, control.generation),
      )).returning({ id: controlTable.id });
      if (spent.length !== 1) return null;
    }
    const changed = await tx.update(outboxTable).set({ dispatchStartedAt: now, updatedAt: now }).where(and(
      eq(outboxTable.id, claim.outboxId), eq(outboxTable.claimId, claim.claimId),
      eq(outboxTable.state, "in_flight"), eq(outboxTable.verificationTokenId, token.id),
      eq(outboxTable.dispatchReservationGeneration, control.generation),
      eq(outboxTable.payloadDigest, outbox.payloadDigest), eq(outboxTable.idempotencyKey, outbox.idempotencyKey),
      isNull(outboxTable.dispatchStartedAt), isNull(outboxTable.finalizedAt),
    )).returning({ id: outboxTable.id });
    if (changed.length !== 1 && control.pilotId !== null) throw new Error("Pilot start transaction aborted");
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
        return classifyResendCandidateReply(response.status, parsed);
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
export async function recoverAbandonedActivationDispatches(betaEnabled=false): Promise<number> {
  const cutoff = new Date(Date.now() - 5 * 60_000);
  // The same live-row predicate is used for discovery AND conditional UPDATE.
  // A start may commit while recovery waits for CONTROL; never reuse its snapshot.
  const abandoned = or(
    and(isNull(outboxTable.dispatchStartedAt), lte(outboxTable.claimedAt, cutoff)),
    and(isNotNull(outboxTable.dispatchStartedAt), lte(outboxTable.dispatchStartedAt, cutoff)),
  );
  const [pilot] = await db.select().from(controlTable).where(eq(controlTable.id, 1));
  if (!pilot || (!betaEnabled && pilot.pilotId !== null && pilot.pilotOutboxId === null)) return 0;
  const candidates = await db.select({ id: outboxTable.id, userId: emailVerificationTokens.userId, tokenId: emailVerificationTokens.id, invitationId:emailVerificationTokens.invitationId })
    .from(outboxTable).innerJoin(emailVerificationTokens, eq(outboxTable.verificationTokenId, emailVerificationTokens.id))
    .where(and(eq(outboxTable.state, "in_flight"), abandoned, betaEnabled ? and(isNotNull(emailVerificationTokens.invitationId),eq(emailVerificationTokens.purpose,"pending_activation")) : pilot.pilotId === null ? isNull(emailVerificationTokens.invitationId) : eq(outboxTable.id, pilot.pilotOutboxId!))).limit(100);
  let recovered = 0;
  for (const item of candidates) {
    recovered += await db.transaction(async tx => {
      const [control] = await tx.select().from(controlTable).where(eq(controlTable.id, 1)).for("share");
      if (!control || (!betaEnabled && control.pilotId !== null && item.id !== control.pilotOutboxId)) return 0;
      await tx.select({ id: users.id }).from(users).where(eq(users.id, item.userId)).for("update");
      await tx.select({ id: emailVerificationTokens.id }).from(emailVerificationTokens).where(eq(emailVerificationTokens.id, item.tokenId)).for("update");
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
export function startActivationWorker(): void {
  if (process.env.AUTH_ACTIVATION_WORKER_ENABLED !== "true") return;
  const runtime = globalThis as typeof globalThis & { __activationWorker?: ReturnType<typeof setInterval> };
  if (runtime.__activationWorker) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      // Missing provider configuration must not even open a DB connection.
      const config = readConfig(process.env);
      if (!config) return;
      config.key.bytes.fill(0);
      await recoverAbandonedActivationDispatches(betaDispatchEnabled(process.env));
      for (let i = 0; i < 10; i++) {
        const result = await dispatchNextActivationMail();
        if (result.status !== "recorded") break;
      }
    } catch { console.error("Activation worker unavailable"); }
    finally { busy = false; }
  };
  runtime.__activationWorker = setInterval(() => { void tick(); }, 10_000);
  runtime.__activationWorker.unref();
  void tick();
}
