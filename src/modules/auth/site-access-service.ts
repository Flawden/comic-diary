import { activationDispatchOperational } from "./registration-activation-config";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { siteAccessPolicy, siteAccessEvents } from "@/db/schema";
import {
  requireInvitationAdmin,
  InvitationError,
  type InvitationActor,
} from "./beta-invitation-admin";
import { ACCOUNT_AUTHORITY_ADVISORY_LOCK } from "./account-administration";
import type { InvitationTx } from "./beta-invitation-state";
export async function readSiteAccess(
  tx: InvitationTx | typeof db = db,
  lock = false,
) {
  const q = tx
    .select()
    .from(siteAccessPolicy)
    .where(eq(siteAccessPolicy.id, 1));
  const [row] = await (lock ? q.for("share") : q);
  if (!row) throw new InvitationError(503, "unavailable");
  return row;
}
export async function setSiteAccess(
  actor: InvitationActor,
  publicRegistration: boolean,
  betaOnly: boolean,
  revision: number,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${ACCOUNT_AUTHORITY_ADVISORY_LOCK})`,
    );
    const [row] = await tx
      .select()
      .from(siteAccessPolicy)
      .where(eq(siteAccessPolicy.id, 1))
      .for("update");
    await requireInvitationAdmin(tx, actor);
    if (!row || row.revision !== revision)
      throw new InvitationError(409, "policy_changed");
    // Capability comes from the existing invitation activation chain; these remain emergency OFF switches.
    if (
      publicRegistration &&
      (process.env.AUTH_BETA_INVITATION_REGISTRATION_ENABLED !== "true" ||
        process.env.AUTH_BETA_INVITATION_DISPATCH_ENABLED !== "true")
    )
      throw new InvitationError(409, "activation_unavailable");
    const [updated] = await tx
      .update(siteAccessPolicy)
      .set({
        publicRegistration,
        betaOnly,
        revision: revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(siteAccessPolicy.id, 1))
      .returning();
    await tx
      .insert(siteAccessEvents)
      .values({
        actorUserId: actor.userId,
        publicRegistration,
        betaOnly,
        revision: revision + 1,
      });
    const live = await tx.execute(
      sql`SELECT 1 FROM sessions WHERE id=${actor.sessionId} AND user_id=${actor.userId} AND expires_at>clock_timestamp()`,
    );
    if (live.rows.length !== 1) throw new InvitationError(401, "unauthorized");
    return updated;
  });
}

export async function publicRegistrationOperational() {
  if (
    process.env.AUTH_BETA_INVITATION_REGISTRATION_ENABLED !== "true" ||
    process.env.AUTH_BETA_INVITATION_DISPATCH_ENABLED !== "true" ||
    !activationDispatchOperational(process.env)
  )
    return false;
  return (await readSiteAccess()).publicRegistration;
}
