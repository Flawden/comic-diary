import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  activationMailDispatchControl,
  betaInvitations,
  emailVerificationTokens,
  users,
} from '@/db/schema';
import {
  invitationEmail,
  invitationHash,
  invitationStatus,
  liveInvitation,
  maskedInvitationEmail,
  betaIntakeEnabled,
  betaDispatchEnabled,
  betaPilotCompatible,
} from './beta-invitation-policy';
import { InvitationError } from './beta-invitation-admin';
import {
  activationDispatchOperational,
  readActivationDispatchConfig,
} from './registration-activation-config';
import { isRegistrationPasswordAllowed } from './registration-service';
import { hashPassword } from './password';
import { enqueuePendingActivationMailInTransaction } from './registration-activation-outbox-issue';
export function betaRegistrationOperational(
  env: Readonly<Record<string, string | undefined>>,
) {
  return (
    betaIntakeEnabled(env) &&
    betaDispatchEnabled(env) &&
    activationDispatchOperational(env)
  );
}
export async function inspectBetaInvitation(secret: unknown) {
  const hash = invitationHash(secret);
  if (!hash) throw new InvitationError(400, 'invalid_invitation');
  const [row] = await db
    .select()
    .from(betaInvitations)
    .where(eq(betaInvitations.secretHash, hash));
  if (!row) throw new InvitationError(400, 'invalid_invitation');
  return {
    status: invitationStatus(row, new Date()),
    emailHint: maskedInvitationEmail(row.email),
    expiresAt: row.expiresAt.toISOString(),
  };
}
export async function registerWithBetaInvitation(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new InvitationError(400, 'invalid_request');
  const v = input as Record<string, unknown>;
  if (v.intent !== 'register' && v.intent !== 'resend')
    throw new InvitationError(400, 'invalid_request');
  const fields =
    v.intent === 'register'
      ? ['intent', 'invitation', 'email', 'password', 'passwordConfirm']
      : ['intent', 'invitation', 'email'];
  if (
    Object.keys(v).length !== fields.length ||
    Object.keys(v).some((k) => !fields.includes(k))
  )
    throw new InvitationError(400, 'invalid_request');
  const email = invitationEmail(v.email),
    hash = invitationHash(v.invitation);
  if (!email || !hash) throw new InvitationError(400, 'invalid_invitation');
  if (
    v.intent === 'register' &&
    (typeof v.password !== 'string' ||
      typeof v.passwordConfirm !== 'string' ||
      v.password !== v.passwordConfirm ||
      !isRegistrationPasswordAllowed(v.password))
  )
    throw new InvitationError(400, 'invalid_password');
  if (!betaRegistrationOperational(process.env))
    throw new InvitationError(503, 'registration_unavailable');
  const config = readActivationDispatchConfig(process.env);
  if (!config) throw new InvitationError(503, 'registration_unavailable');
  try {
    const passwordHash =
      v.intent === 'register' ? await hashPassword(v.password as string) : null;
    return await db.transaction(async (tx) => {
      const [gate] = await tx
        .select()
        .from(activationMailDispatchControl)
        .where(eq(activationMailDispatchControl.id, 1))
        .for('share');
      if (!gate?.enabled || gate.generation <= 0 || !betaPilotCompatible(gate))
        throw new InvitationError(503, 'registration_unavailable');
      const [invite] = await tx
        .select()
        .from(betaInvitations)
        .where(eq(betaInvitations.secretHash, hash))
        .for('update');
      if (!liveInvitation(invite, new Date()) || invite.email !== email)
        throw new InvitationError(400, 'invalid_invitation');
      if (invite.pendingUserId !== null && v.intent === 'register')
        return { ok: true, activationRequired: true };
      if (invite.pendingUserId === null && v.intent === 'resend')
        return { ok: true, activationRequired: true };
      let newUserId: number | null = null;
      if (invite.pendingUserId === null) {
        const [created] = await tx
          .insert(users)
          .values({
            email,
            passwordHash: passwordHash!,
            role: 'USER',
            isActive: true,
            verificationRequiredAt: new Date(),
          })
          .onConflictDoNothing({ target: users.email })
          .returning({ id: users.id });
        newUserId = created?.id ?? null;
      }
      const [account] = await tx
        .select()
        .from(users)
        .where(
          invite.pendingUserId === null
            ? eq(users.email, email)
            : eq(users.id, invite.pendingUserId),
        )
        .for('update');
      if (
        !account ||
        account.email !== email ||
        account.role !== 'USER' ||
        !account.isActive ||
        account.emailVerifiedAt !== null ||
        account.verificationRequiredAt === null
      ) {
        if (newUserId !== null)
          throw Error('New invitation account failed validation');
        return { ok: true, activationRequired: true };
      }
      if (invite.pendingUserId === null && newUserId === null) {
        const [previous] = await tx
          .select({ id: betaInvitations.id })
          .from(betaInvitations)
          .where(eq(betaInvitations.pendingUserId, account.id))
          .limit(1);
        if (!previous) return { ok: true, activationRequired: true };
      }
      if (invite.pendingUserId === null)
        await tx
          .update(betaInvitations)
          .set({ pendingUserId: account.id, claimedAt: new Date() })
          .where(eq(betaInvitations.id, invite.id));
      const recent = await tx
        .select({
          n: sql<number>`count(*)::int`,
          last: sql<Date | null>`max(${emailVerificationTokens.createdAt})`,
        })
        .from(emailVerificationTokens)
        .where(
          and(
            eq(emailVerificationTokens.userId, account.id),
            gte(
              emailVerificationTokens.createdAt,
              new Date(Date.now() - 3600_000),
            ),
          ),
        );
      if (
        recent[0].n >= 5 ||
        (recent[0].last &&
          Date.now() - new Date(recent[0].last).getTime() < 60_000)
      )
        return { ok: true, activationRequired: true };
      const queued = await enqueuePendingActivationMailInTransaction(tx, {
        userId: account.id,
        publicOrigin: config.publicOrigin,
        key: config.key,
        invitationId: invite.id,
        notAfter: invite.expiresAt,
      });
      if (!queued.ok) throw Error('Invitation activation enqueue aborted');
      return { ok: true, activationRequired: true };
    });
  } finally {
    config.key.bytes.fill(0);
  }
}
