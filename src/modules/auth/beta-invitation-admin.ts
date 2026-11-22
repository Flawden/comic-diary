import { and, eq, sql, desc } from 'drizzle-orm';
import { db } from '@/db';
import {
  activationMailDispatchControl,
  betaInvitations,
  betaInvitationEvents,
  sessions,
  users,
} from '@/db/schema';
import { hasPermission } from './permissions';
import { canUseFullAccountSession } from './registration-activation-policy';
import {
  invitationEmail,
  invitationStatus,
  newInvitationSecret,
  INVITATION_LIFETIME_MS,
} from './beta-invitation-policy';
import type { InvitationTx } from './beta-invitation-state';
export type InvitationActor = { userId: number; sessionId: number };
export class InvitationError extends Error {
  constructor(
    readonly status: number,
    readonly kind: string,
  ) {
    super(kind);
  }
}
export async function requireInvitationAdmin(
  tx: InvitationTx,
  actor: InvitationActor,
) {
  const [a] = await tx
    .select({
      id: users.id,
      role: users.role,
      isActive: users.isActive,
      emailVerifiedAt: users.emailVerifiedAt,
      verificationRequiredAt: users.verificationRequiredAt,
      expiresAt: sessions.expiresAt,
    })
    .from(users)
    .innerJoin(sessions, eq(sessions.userId, users.id))
    .where(and(eq(users.id, actor.userId), eq(sessions.id, actor.sessionId)))
    .for('share');
  if (!a || !canUseFullAccountSession(a) || a.expiresAt.getTime() <= Date.now())
    throw new InvitationError(401, 'unauthorized');
  if (a.role !== 'ADMIN' || !hasPermission(a.role, 'ADMIN_USERS'))
    throw new InvitationError(403, 'forbidden');
}
async function adminStillLive(tx: InvitationTx, actor: InvitationActor) {
  const rows = await tx.execute(
    sql`SELECT 1 FROM sessions WHERE id=${actor.sessionId} AND user_id=${actor.userId} AND expires_at>clock_timestamp()`,
  );
  if (rows.rows.length !== 1) throw new InvitationError(401, 'unauthorized');
}
async function control(tx: InvitationTx) {
  const [row] = await tx
    .select({ id: activationMailDispatchControl.id })
    .from(activationMailDispatchControl)
    .where(eq(activationMailDispatchControl.id, 1))
    .for('share');
  if (!row) throw new InvitationError(503, 'unavailable');
}
export async function createBetaInvitation(
  actor: InvitationActor,
  rawEmail: unknown,
  grantsBeta = false,
) {
  const email = invitationEmail(rawEmail);
  if (!email) throw new InvitationError(400, 'invalid_email');
  const secret = newInvitationSecret();
  return db.transaction(async (tx) => {
    await control(tx);
    await requireInvitationAdmin(tx, actor);
    // Serialize creation quota for this administrator without logging an address or secret.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(536000020,${actor.userId})`,
    );
    const recent = await tx.execute<{ n: number }>(
      sql`SELECT count(*)::int n FROM beta_registration_invitations WHERE created_by_user_id=${actor.userId} AND created_at>clock_timestamp()-interval '1 hour'`,
    );
    if (recent.rows[0].n >= 100) throw new InvitationError(429, 'rate_limited');
    const [existing] = await tx
      .select({
        id: users.id,
        role: users.role,
        emailVerifiedAt: users.emailVerifiedAt,
        verificationRequiredAt: users.verificationRequiredAt,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.email, email));
    if (existing) {
      const [prior] = await tx
        .select({ id: betaInvitations.id })
        .from(betaInvitations)
        .where(eq(betaInvitations.pendingUserId, existing.id))
        .limit(1);
      if (
        !prior ||
        existing.role !== 'USER' ||
        !existing.isActive ||
        existing.emailVerifiedAt !== null ||
        existing.verificationRequiredAt === null
      )
        throw new InvitationError(409, 'account_exists');
    }
    const now = new Date();
    const [row] = await tx
      .insert(betaInvitations)
      .values({
        secretHash: secret.hash,
        grantsBeta,
        email,
        createdByUserId: actor.userId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
      })
      .returning({
        id: betaInvitations.id,
        expiresAt: betaInvitations.expiresAt,
      });
    await tx
      .insert(betaInvitationEvents)
      .values({
        invitationId: row.id,
        actorUserId: actor.userId,
        action: 'CREATED',
      });
    await adminStillLive(tx, actor);
    return {
      id: row.id,
      expiresAt: row.expiresAt.toISOString(),
      secret: secret.secret,
    };
  });
}
export async function listBetaInvitations(
  actor: InvitationActor,
  beforeId?: number,
) {
  return db.transaction(async (tx) => {
    await requireInvitationAdmin(tx, actor);
    const rows = await tx
      .select({
        id: betaInvitations.id,
        email: betaInvitations.email,
        grantsBeta: betaInvitations.grantsBeta,
        createdAt: betaInvitations.createdAt,
        expiresAt: betaInvitations.expiresAt,
        revokedAt: betaInvitations.revokedAt,
        claimedAt: betaInvitations.claimedAt,
        pendingUserId: betaInvitations.pendingUserId,
        activatedAt: betaInvitations.activatedAt,
      })
      .from(betaInvitations)
      .where(beforeId ? sql`${betaInvitations.id}<${beforeId}` : undefined)
      .orderBy(desc(betaInvitations.id))
      .limit(51);
    const now = new Date();
    return {
      items: rows
        .slice(0, 50)
        .map((r) => ({
          id: r.id,
          email: r.email,
          grantsBeta: r.grantsBeta,
          createdAt: r.createdAt.toISOString(),
          expiresAt: r.expiresAt.toISOString(),
          status: invitationStatus(r, now),
        })),
      nextCursor: rows.length > 50 ? rows[49].id : null,
    };
  });
}
export async function revokeBetaInvitation(actor: InvitationActor, id: number) {
  return db.transaction(async (tx) => {
    await control(tx);
    const [row] = await tx
      .select()
      .from(betaInvitations)
      .where(eq(betaInvitations.id, id))
      .for('update');
    await requireInvitationAdmin(tx, actor);
    if (!row) throw new InvitationError(404, 'not_found');
    if (row.activatedAt) throw new InvitationError(409, 'already_activated');
    if (!row.revokedAt) {
      await tx
        .update(betaInvitations)
        .set({ revokedAt: new Date() })
        .where(eq(betaInvitations.id, id));
      await tx
        .insert(betaInvitationEvents)
        .values({
          invitationId: id,
          actorUserId: actor.userId,
          action: 'REVOKED',
        });
    }
    await adminStillLive(tx, actor);
    return {
      ok: true,
      warning:
        'Уже начатая отправка письма может завершиться. Отозванное приглашение больше не разрешает активацию.',
    };
  });
}
