/** Server-only own-account operations. No bearer reauthentication grant exists.
 * Argon2 runs outside locks; its exact hash is revalidated under USER lock.
 * Identity is derived from the actual session secret, never from a client userId.
 */
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { activationMailDispatchControl, activationMailOutbox, emailVerificationTokens, sessions, users } from "@/db/schema";
import { pilotAllowsIssue } from "./activation-mail-pilot";
import { verifyPassword } from "./password";
import { hashSessionToken } from "./session-token";
import { hashEmailVerificationToken } from "./email-verification-token";
import { canRedeemEmailVerification } from "./email-verification-policy";
import { canUseFullAccountSession, getActivationState } from "./registration-activation-policy";
import { activationDispatchOperational, readActivationDispatchConfig } from "./registration-activation-config";
import { enqueueVerificationMailInTransaction } from "./registration-activation-outbox-issue";
import { legacyVerificationEnabled, legacyVerificationRequestEnabled } from "./verification-purpose";

type Result = { ok: true } | { ok: false; kind: "verification_failed" | "verification_unavailable" };
const FAILED = { ok: false, kind: "verification_failed" } as const;
const UNAVAILABLE = { ok: false, kind: "verification_unavailable" } as const;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Checked = { userId: number; sessionId: number; sessionHash: string; passwordHash: string };

/** Read-only HTTP identity lookup: verification must not rotate, revoke or even
 * touch lastSeenAt on ordinary sessions. Final authorization still rechecks locks.
 */
export async function resolveLegacyVerificationSession(sessionToken: string) {
  if (typeof sessionToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) return null;
  const [row] = await db.select({ userId: users.id, isActive: users.isActive,
    emailVerifiedAt: users.emailVerifiedAt, verificationRequiredAt: users.verificationRequiredAt })
    .from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(and(
      eq(sessions.tokenHash, hashSessionToken(sessionToken)), sql`${sessions.expiresAt} > clock_timestamp()`,
    ));
  return row && canUseFullAccountSession(row) ? { userId: row.userId } : null;
}

async function checkCredentials(sessionToken: string, currentPassword: string): Promise<Checked | null> {
  if (typeof sessionToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(sessionToken) ||
      typeof currentPassword !== "string" || !currentPassword.length || Buffer.byteLength(currentPassword, "utf8") > 1024) return null;
  const sessionHash = hashSessionToken(sessionToken);
  const [row] = await db.select({ userId: users.id, sessionId: sessions.id, passwordHash: users.passwordHash })
    .from(sessions).innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, sessionHash), eq(users.isActive, true),
      sql`${sessions.expiresAt} > clock_timestamp()`));
  if (!row?.passwordHash || !await verifyPassword(row.passwordHash, currentPassword)) return null;
  return { ...row, passwordHash: row.passwordHash, sessionHash };
}

async function lockOwner(tx: Tx, checked: Checked) {
  const [account] = await tx.select().from(users).where(eq(users.id, checked.userId)).for("update");
  if (!account || account.passwordHash !== checked.passwordHash || getActivationState(account) !== "legacy_unverified") return null;
  const [session] = await tx.select().from(sessions).where(and(
    eq(sessions.id, checked.sessionId), eq(sessions.userId, account.id), eq(sessions.tokenHash, checked.sessionHash),
    sql`${sessions.expiresAt} > clock_timestamp()`,
  )).for("update");
  return session ? account : null;
}

function liveSession(checked: Checked) {
  return sql`exists (select 1 from ${sessions} where ${sessions.id} = ${checked.sessionId}
    and ${sessions.userId} = ${checked.userId} and ${sessions.tokenHash} = ${checked.sessionHash}
    and ${sessions.expiresAt} > clock_timestamp())`;
}

async function request(sessionToken: string, currentPassword: string, afterPasswordCheck?: () => Promise<void>): Promise<Result> {
  if (!legacyVerificationRequestEnabled(process.env) || !activationDispatchOperational(process.env)) return UNAVAILABLE;
  const checked = await checkCredentials(sessionToken, currentPassword);
  if (!checked) return FAILED;
  await afterPasswordCheck?.();
  const config = readActivationDispatchConfig(process.env);
  if (!config) return UNAVAILABLE;
  try {
    return await db.transaction(async tx => {
      const [control] = await tx.select().from(activationMailDispatchControl).where(eq(activationMailDispatchControl.id, 1)).for("update");
      if (!control?.enabled || control.generation <= 0) return UNAVAILABLE;
      if (!pilotAllowsIssue(control, checked.userId)) return FAILED;
      const account = await lockOwner(tx, checked);
      if (!account) return FAILED;
      const now = new Date();
      const [recent] = await tx.select({ count: sql<number>`count(*)::int`, newest: sql<Date | null>`max(${emailVerificationTokens.createdAt})` })
        .from(emailVerificationTokens).where(and(eq(emailVerificationTokens.userId, account.id),
          gte(emailVerificationTokens.createdAt, new Date(now.getTime() - 3600_000))));
      if (recent.count >= 5 || (recent.newest && now.getTime() - new Date(recent.newest).getTime() < 60_000)) return { ok: true } as const;
      const queued = await enqueueVerificationMailInTransaction(tx,
        { userId: account.id, publicOrigin: config.publicOrigin, key: config.key }, "legacy_email_verification");
      if (!queued.ok) throw new Error("Verification issuance aborted");
      if (control.pilotId !== null) {
        // USER is still locked; the one-open-token index identifies this issuance.
        const issued = await tx.select({ id: activationMailOutbox.id }).from(activationMailOutbox)
          .innerJoin(emailVerificationTokens, eq(activationMailOutbox.verificationTokenId, emailVerificationTokens.id))
          .where(and(eq(emailVerificationTokens.userId, account.id), eq(emailVerificationTokens.purpose, "legacy_email_verification"),
            isNull(emailVerificationTokens.revokedAt), isNull(emailVerificationTokens.consumedAt)));
        if (issued.length !== 1) throw new Error("Pilot job binding unavailable");
        const pinned = await tx.update(activationMailDispatchControl).set({ pilotOutboxId: issued[0].id })
          .where(and(eq(activationMailDispatchControl.id, 1), eq(activationMailDispatchControl.pilotId, control.pilotId),
            eq(activationMailDispatchControl.pilotUserId, 1), isNull(activationMailDispatchControl.pilotOutboxId),
            isNull(activationMailDispatchControl.pilotDispatchUsedAt), isNull(activationMailDispatchControl.pilotClosedAt)))
          .returning({ id: activationMailDispatchControl.id });
        if (pinned.length !== 1) throw new Error("Pilot issuance binding aborted");
      }
      // Expiry can pass while waiting for TOKEN/OUTBOX. Roll back every write.
      const [live] = await tx.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.id, checked.sessionId), liveSession(checked)));
      if (!live) throw new Error("Verification session expired");
      return { ok: true } as const;
    });
  } finally { config.key.bytes.fill(0); }
}

async function redeem(sessionToken: string, currentPassword: string, token: unknown, afterPasswordCheck?: () => Promise<void>): Promise<Result> {
  if (!legacyVerificationEnabled(process.env)) return UNAVAILABLE;
  const tokenHash = hashEmailVerificationToken(token);
  if (!tokenHash) return FAILED;
  const checked = await checkCredentials(sessionToken, currentPassword);
  if (!checked) return FAILED;
  await afterPasswordCheck?.();
  return db.transaction(async tx => {
    const account = await lockOwner(tx, checked);
    if (!account) return FAILED;
    const [challenge] = await tx.select().from(emailVerificationTokens).where(and(
      eq(emailVerificationTokens.tokenHash, tokenHash), eq(emailVerificationTokens.userId, account.id),
    )).for("update");
    const now = new Date();
    if (!challenge || challenge.purpose !== "legacy_email_verification" || !canRedeemEmailVerification(account, challenge, now)) return FAILED;
    const consumed = await tx.update(emailVerificationTokens).set({ consumedAt: now }).where(and(
      eq(emailVerificationTokens.id, challenge.id), eq(emailVerificationTokens.userId, account.id),
      eq(emailVerificationTokens.purpose, "legacy_email_verification"), eq(emailVerificationTokens.emailSnapshot, account.email),
      isNull(emailVerificationTokens.consumedAt), isNull(emailVerificationTokens.revokedAt),
      sql`${emailVerificationTokens.expiresAt} > clock_timestamp()`, liveSession(checked),
    )).returning({ id: emailVerificationTokens.id });
    if (consumed.length !== 1) return FAILED;
    const verified = await tx.update(users).set({ emailVerifiedAt: now, updatedAt: now }).where(and(
      eq(users.id, account.id), eq(users.email, account.email), eq(users.passwordHash, checked.passwordHash),
      eq(users.isActive, true), isNull(users.emailVerifiedAt), isNull(users.verificationRequiredAt), liveSession(checked),
    )).returning({ id: users.id });
    if (verified.length !== 1) throw new Error("Legacy verification update aborted");
    const revoked = await tx.update(emailVerificationTokens).set({ revokedAt: now }).where(and(
      eq(emailVerificationTokens.userId, account.id), isNull(emailVerificationTokens.consumedAt), isNull(emailVerificationTokens.revokedAt),
    )).returning({ id: emailVerificationTokens.id });
    await tx.update(activationMailOutbox).set({ state: "expired", finalizedAt: now, updatedAt: now }).where(and(
      inArray(activationMailOutbox.verificationTokenId, [challenge.id, ...revoked.map(row => row.id)]), eq(activationMailOutbox.state, "ready"),
    ));
    return { ok: true } as const;
  });
}

export async function requestOwnLegacyEmailVerification(sessionToken: string, currentPassword: string): Promise<Result> {
  return request(sessionToken, currentPassword);
}
export async function redeemOwnLegacyEmailVerification(sessionToken: string, currentPassword: string, token: unknown): Promise<Result> {
  return redeem(sessionToken, currentPassword, token);
}
/** Deterministic race seam unavailable in production and never selected by flags. */
export async function legacyVerificationForTest(input: {
  action: "request" | "redeem"; sessionToken: string; currentPassword: string; token?: unknown; afterPasswordCheck: () => Promise<void>;
}): Promise<Result> {
  if (process.env.NODE_ENV !== "test") return FAILED;
  return input.action === "request" ? request(input.sessionToken, input.currentPassword, input.afterPasswordCheck)
    : redeem(input.sessionToken, input.currentPassword, input.token, input.afterPasswordCheck);
}
