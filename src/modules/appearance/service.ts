import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  users,
  sessions,
  userAppearance as appearance,
  appearanceEvents,
} from '@/db/schema';
import { ACCOUNT_AUTHORITY_ADVISORY_LOCK } from '@/modules/auth/account-administration';
import { canUseFullAccountSession } from '@/modules/auth/registration-activation-policy';
import {
  BETA_FRAME,
  AVATAR_FILENAME,
  AppearanceError,
  EMPTY_APPEARANCE,
  revisionValue,
  type PublicAppearance,
} from './policy';
import { betaFrameReady, BETA_FRAME_URL } from './frames';
export type AppearanceActor = { userId: number; sessionId: number };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Row = typeof appearance.$inferSelect;
export const appearanceDefaults = {
  avatarFilename: null,
  selectedFrame: null,
  betaParticipant: false,
  betaFrameGranted: false,
  revision: 0,
};
export function publicAppearance(
  row:
    | Pick<Row, 'avatarFilename' | 'selectedFrame' | 'betaFrameGranted'>
    | null
    | undefined,
  active = true,
): PublicAppearance {
  if (!active || !row) return { ...EMPTY_APPEARANCE };
  return {
    avatarUrl:
      row.avatarFilename && AVATAR_FILENAME.test(row.avatarFilename)
        ? '/media/avatars/' + row.avatarFilename
        : null,
    frameUrl:
      row.selectedFrame === BETA_FRAME &&
      row.betaFrameGranted &&
      betaFrameReady()
        ? BETA_FRAME_URL
        : null,
  };
}
export async function getPublicAppearances(
  ids: (number | null)[],
  tx: Tx | typeof db = db,
) {
  const unique = [
    ...new Set(
      ids.filter(
        (id): id is number =>
          typeof id === 'number' && Number.isSafeInteger(id) && id > 0,
      ),
    ),
  ];
  if (!unique.length) return new Map<number, PublicAppearance>();
  const rows = await tx
    .select({ id: users.id, active: users.isActive, appearance })
    .from(users)
    .leftJoin(appearance, eq(appearance.userId, users.id))
    .where(inArray(users.id, unique));
  return new Map(
    rows.map((r) => [r.id, publicAppearance(r.appearance, r.active)]),
  );
}
export async function ownAppearance(userId: number) {
  const [row] = await db
    .select()
    .from(appearance)
    .where(eq(appearance.userId, userId));
  return {
    ...(row ?? appearanceDefaults),
    ...publicAppearance(row),
    frameReady: betaFrameReady(),
  };
}
async function change(
  actor: AppearanceActor,
  target: number,
  revision: number,
  admin: boolean,
  edit: (r: Row | typeof appearanceDefaults) => Partial<Row>,
) {
  revisionValue(revision);
  if (!Number.isSafeInteger(target) || target < 1)
    throw new AppearanceError(400, 'invalid_user');
  return db.transaction(async (tx) => {
    // Same authority lock as role/active administration. No AUTH control row or gate writes.
    // Authority -> USER (ascending, SHARE) -> SESSION (SHARE) -> APPEARANCE (UPDATE).
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${ACCOUNT_AUTHORITY_ADVISORY_LOCK})`,
    );
    const accounts = await tx
      .select({
        id: users.id,
        role: users.role,
        isActive: users.isActive,
        emailVerifiedAt: users.emailVerifiedAt,
        verificationRequiredAt: users.verificationRequiredAt,
      })
      .from(users)
      .where(
        inArray(
          users.id,
          [...new Set([actor.userId, target])].sort((a, b) => a - b),
        ),
      )
      .orderBy(users.id)
      .for('share');
    const who = accounts.find((a) => a.id === actor.userId);
    if (!who || !canUseFullAccountSession(who))
      throw new AppearanceError(401, 'unauthorized');
    if (admin ? who.role !== 'ADMIN' : target !== actor.userId)
      throw new AppearanceError(403, 'forbidden');
    if (!accounts.some((a) => a.id === target))
      throw new AppearanceError(404, 'not_found');
    const valid = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.id, actor.sessionId),
          eq(sessions.userId, actor.userId),
          sql`${sessions.expiresAt}>clock_timestamp()`,
        ),
      )
      .for('share');
    if (valid.length !== 1) throw new AppearanceError(401, 'unauthorized');
    const [old] = await tx
      .select()
      .from(appearance)
      .where(eq(appearance.userId, target))
      .for('update');
    const current = old ?? appearanceDefaults;
    if (current.revision !== revision)
      throw new AppearanceError(409, 'appearance_changed');
    const fields = edit(current);
    const data = { ...fields, revision: revision + 1, updatedAt: new Date() };
    const [saved] = await tx
      .insert(appearance)
      .values({ ...current, userId: target, ...data })
      .onConflictDoUpdate({ target: appearance.userId, set: data })
      .returning();
    if (
      admin &&
      (current.betaParticipant !== saved.betaParticipant ||
        current.betaFrameGranted !== saved.betaFrameGranted)
    )
      await tx.insert(appearanceEvents).values({
        actorUserId: actor.userId,
        targetUserId: target,
        betaParticipant: saved.betaParticipant,
        betaFrameGranted: saved.betaFrameGranted,
      });
    return {
      ...saved,
      ...publicAppearance(saved),
      frameReady: betaFrameReady(),
    };
  });
}
export async function setOwnAvatar(
  actor: AppearanceActor,
  filename: string | null,
  revision: number,
) {
  if (filename !== null && !AVATAR_FILENAME.test(filename))
    throw new AppearanceError(400, 'invalid_avatar');
  // Existing backups copy media AFTER their DB snapshot. Keep normalized files
  // append-only so a concurrently replaced avatar remains restorable. Removing
  // the DB reference immediately makes its old URL 404 (no-store on every GET).
  // A future retention-aware garbage collector must account for retained backups.
  return change(actor, actor.userId, revision, false, () => ({
    avatarFilename: filename,
  }));
}
export async function selectOwnFrame(
  actor: AppearanceActor,
  frame: unknown,
  revision: number,
) {
  if (frame !== null && frame !== BETA_FRAME)
    throw new AppearanceError(400, 'invalid_frame');
  return change(actor, actor.userId, revision, false, (current) => {
    if (frame === BETA_FRAME && !current.betaFrameGranted)
      throw new AppearanceError(403, 'frame_unavailable');
    if (frame === BETA_FRAME && !betaFrameReady())
      throw new AppearanceError(503, 'frame_asset_unavailable');
    return { selectedFrame: frame };
  });
}
export async function setBetaAccess(
  actor: AppearanceActor,
  target: number,
  participant: unknown,
  granted: unknown,
  revision: number,
) {
  if (
    typeof participant !== 'boolean' ||
    typeof granted !== 'boolean' ||
    (granted && !participant)
  )
    throw new AppearanceError(400, 'invalid_beta_access');
  return change(actor, target, revision, true, () => ({
    betaParticipant: participant,
    betaFrameGranted: granted,
    ...(!granted ? { selectedFrame: null } : {}),
  }));
}
