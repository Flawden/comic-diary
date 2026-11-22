import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { betaInvitations, emailVerificationTokens, userAppearance, appearanceEvents } from '@/db/schema';
import { liveInvitation } from './beta-invitation-policy';
export type InvitationTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Caller holds CONTROL before entering; never acquire this after USER. */
export async function lockBoundInvitation(
  tx: InvitationTx,
  id: number | null,
  userId: number,
  mode: 'share' | 'update' = 'share',
) {
  if (id === null) return null;
  const [invite] = await tx
    .select()
    .from(betaInvitations)
    .where(eq(betaInvitations.id, id))
    .for(mode);
  return invite &&
    invite.pendingUserId === userId &&
    liveInvitation(invite, new Date())
    ? invite
    : null;
}
/** Applied before claim LIMIT, as well as rechecked under locks at start. */
export const liveInvitationCandidate = () =>
  sql`EXISTS (SELECT 1 FROM beta_registration_invitations bi WHERE bi.id=${emailVerificationTokens.invitationId} AND bi.pending_user_id=${emailVerificationTokens.userId} AND bi.email=${emailVerificationTokens.emailSnapshot} AND bi.revoked_at IS NULL AND bi.activated_at IS NULL AND bi.expires_at>clock_timestamp())`;
export async function activateBoundInvitation(
  tx: InvitationTx,
  id: number,
  userId: number,
  now: Date,
) {
  const changed = await tx
    .update(betaInvitations)
    .set({ activatedAt: now })
    .where(
      and(
        eq(betaInvitations.id, id),
        eq(betaInvitations.pendingUserId, userId),
        isNull(betaInvitations.activatedAt),
        isNull(betaInvitations.revokedAt),
        sql`${betaInvitations.expiresAt}>${now}`,
      ),
    )
    .returning({ id: betaInvitations.id, grantsBeta: betaInvitations.grantsBeta, actor:betaInvitations.createdByUserId });
  if (changed.length !== 1) throw Error('Invitation activation aborted');
  if(changed[0].grantsBeta){
    // Caller already holds USER UPDATE. Keep avatar, frame and award untouched.
    const [prior]=await tx.select().from(userAppearance).where(eq(userAppearance.userId,userId)).for('update');
    if(!prior?.betaParticipant){
      if(prior) await tx.update(userAppearance).set({betaParticipant:true,revision:prior.revision+1,updatedAt:now}).where(eq(userAppearance.userId,userId));
      else await tx.insert(userAppearance).values({userId,betaParticipant:true});
      await tx.insert(appearanceEvents).values({actorUserId:changed[0].actor,targetUserId:userId,betaParticipant:true,betaFrameGranted:prior?.betaFrameGranted??false});
    }
  }
}
