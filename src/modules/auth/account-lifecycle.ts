import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accountLifecycleEvents, activationMailDispatchControl, passwordResetMailDispatchControl,
  users, sessions, userAppearance, userComics, userChapterReads, userEntitlements,
  passwordResetTokens, emailVerificationTokens, communityReviewReactions } from "@/db/schema";
import { ACCOUNT_AUTHORITY_ADVISORY_LOCK } from "./account-administration";
import { canUseFullAccountSession } from "./registration-activation-policy";
import { verifyPassword } from "./password";
import { AppearanceError } from "@/modules/appearance/policy";

export type LifecycleAction = "BAN" | "UNBAN" | "DELETE" | "SELF_DELETE";
export type LifecycleActor = { userId: number; sessionId: number };

/** CONTROL -> AUTHORITY -> USER (ascending) -> SESSION -> TOKEN.
 * No dispatch control writes. Stable tombstones keep audit/pilot/reply references intact.
 */
export async function changeAccountLifecycle(actor: LifecycleActor, targetId: number,
  action: LifecycleAction, currentPassword?: string) {
  if (!Number.isSafeInteger(targetId) || targetId < 1 ||
    !["BAN", "UNBAN", "DELETE", "SELF_DELETE"].includes(action))
    throw new AppearanceError(400, "invalid_request");
  return db.transaction(async tx => {
    // Serialize against issuance/dispatch without toggling either gate or generation.
    await tx.select({ id: activationMailDispatchControl.id }).from(activationMailDispatchControl).for("update");
    await tx.select({ id: passwordResetMailDispatchControl.id }).from(passwordResetMailDispatchControl).for("update");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ACCOUNT_AUTHORITY_ADVISORY_LOCK})`);
    const accounts = await tx.select().from(users)
      .where(inArray(users.id, [...new Set([actor.userId, targetId])].sort((a,b)=>a-b)))
      .orderBy(users.id).for("update");
    const who = accounts.find(u=>u.id===actor.userId), target = accounts.find(u=>u.id===targetId);
    if (!who || who.deletedAt || !canUseFullAccountSession(who)) throw new AppearanceError(401,"unauthorized");
    const [session] = await tx.select({id:sessions.id}).from(sessions).where(and(
      eq(sessions.id,actor.sessionId),eq(sessions.userId,who.id),sql`${sessions.expiresAt}>clock_timestamp()`)).for("update");
    if (!session) throw new AppearanceError(401,"unauthorized");
    if (action === "SELF_DELETE" ? targetId !== who.id : who.role !== "ADMIN") throw new AppearanceError(403,"forbidden");
    if (!target) throw new AppearanceError(404,"not_found");
    if (target.deletedAt) throw new AppearanceError(409,"account_deleted");
    if (action === "SELF_DELETE" && (!currentPassword || Buffer.byteLength(currentPassword)>256 ||
      !target.passwordHash || !await verifyPassword(target.passwordHash,currentPassword)))
      throw new AppearanceError(401,"invalid_current_password");
    if (action !== "SELF_DELETE" && targetId === who.id) throw new AppearanceError(409,"use_own_account_settings");
    if (action !== "UNBAN" && target.role === "ADMIN" && target.isActive) {
      const count = await tx.select({n:sql<number>`count(*)::int`}).from(users)
        .where(and(eq(users.role,"ADMIN"),eq(users.isActive,true),isNull(users.deletedAt)));
      if(count[0].n<=1) throw new AppearanceError(409,"last_active_admin");
    }
    const deleting = action === "DELETE" || action === "SELF_DELETE";
    const active = action === "UNBAN";
    if (!deleting && target.isActive===active) return {ok:true,sessionsRevoked:0};
    const now = new Date();
    // No token deletion: immutable closed pilot and dispatch records must survive.
    await tx.update(passwordResetTokens).set({revokedAt:now}).where(and(eq(passwordResetTokens.userId,targetId),isNull(passwordResetTokens.consumedAt),isNull(passwordResetTokens.revokedAt)));
    await tx.update(emailVerificationTokens).set({revokedAt:now}).where(and(eq(emailVerificationTokens.userId,targetId),isNull(emailVerificationTokens.consumedAt),isNull(emailVerificationTokens.revokedAt)));
    const revoked = await tx.delete(sessions).where(eq(sessions.userId,targetId)).returning({id:sessions.id});
    if (deleting) {
      await tx.delete(userAppearance).where(eq(userAppearance.userId,targetId));
      await tx.delete(userChapterReads).where(eq(userChapterReads.userId,targetId));
      await tx.delete(userComics).where(eq(userComics.userId,targetId));
      await tx.delete(userEntitlements).where(eq(userEntitlements.userId,targetId));
      await tx.delete(communityReviewReactions).where(eq(communityReviewReactions.userId,targetId));
      // Private works are personal data. Detach archived-edition edges before cascade.
      await tx.execute(sql`UPDATE chapters SET supersedes_chapter_id=NULL WHERE comic_id IN (SELECT id FROM comics WHERE owner_user_id=${targetId} AND visibility='PRIVATE')`);
      await tx.execute(sql`DELETE FROM user_chapter_reads WHERE chapter_id IN (SELECT id FROM chapters WHERE comic_id IN (SELECT id FROM comics WHERE owner_user_id=${targetId} AND visibility='PRIVATE'))`);
      await tx.execute(sql`DELETE FROM comics WHERE owner_user_id=${targetId} AND visibility='PRIVATE'`);
      await tx.update(users).set({email:`deleted-${randomUUID()}@account.invalid`,displayName:"Удалённый пользователь",
        passwordHash:null,isActive:false,role:"USER",emailVerifiedAt:null,deletedAt:now,updatedAt:now}).where(eq(users.id,targetId));
    } else await tx.update(users).set({isActive:active,updatedAt:now}).where(eq(users.id,targetId));
    await tx.insert(accountLifecycleEvents).values({actorUserId:actor.userId,targetUserId:targetId,action});
    return {ok:true,sessionsRevoked:revoked.length};
  });
}
