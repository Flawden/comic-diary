import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { chapters, comics, users, sessions, communityComments as comments, communityControls as controls,
  communityReports as reports, communityModerationEvents as events } from "@/db/schema";
import { SHARED_CATALOG_ADVISORY_LOCK } from "@/modules/catalog/canonical-catalog-write";
import { hasPermission } from "@/modules/auth/permissions";
import { canUseFullAccountSession } from "@/modules/auth/registration-activation-policy";
import { COMMUNITY_LIMITS as limits, CommunityError, decodeCursor, encodeCursor, parseCreate, parseEdit,
  parseReport, parseModeration, positiveId, publicAlias, type Actor, type Target, type PublicComment,
  type CommentPage, type CommentStatus } from "./policy";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Comment = typeof comments.$inferSelect;
type Control = typeof controls.$inferSelect;
type Context = { tx: Tx; now: Date; actor: Actor; control: Control; name: string | null };
const notFound = (): never => { throw new CommunityError(404, "not_found"); };
const forbidden = (): never => { throw new CommunityError(403, "forbidden"); };
const conflict = (): never => { throw new CommunityError(409, "conflict"); };
const targetWhere = (target: Target) => and(eq(comments.comicId, target.comicId),
  target.chapterId === null ? isNull(comments.chapterId) : eq(comments.chapterId, target.chapterId));

function dto(row: Comment, name: string | null, active: boolean, viewer: number | null): PublicComment {
  return { id: row.id, parentId: row.parentId, author: publicAlias(name, active), mine: viewer !== null && row.authorUserId === viewer,
    body: row.status === "VISIBLE" ? row.body : null, spoiler: row.status === "VISIBLE" && row.spoiler,
    status: row.status as CommentStatus, createdAt: row.createdAt.toISOString(), editedAt: row.editedAt?.toISOString() ?? null };
}

/** SHARE prevents ordinary catalog UPDATE from changing access during a request. */
async function lockTarget(tx: Tx, target: Target) {
  positiveId(target.comicId); if (target.chapterId !== null) positiveId(target.chapterId);
  const [comic] = await tx.select({ id: comics.id }).from(comics).where(and(eq(comics.id, target.comicId),
    eq(comics.visibility, "SHARED"), eq(comics.publicationStatus, "PUBLISHED"))).for("share");
  if (!comic) notFound();
  if (target.chapterId !== null) {
    const [chapter] = await tx.select({ id: chapters.id }).from(chapters).where(and(eq(chapters.id, target.chapterId),
      eq(chapters.comicId, target.comicId), eq(chapters.status, "RELEASED"))).for("share");
    if (!chapter) notFound();
  }
}

async function mutate<T>(actor: Actor, action: (context: Context) => Promise<T>, admin = false): Promise<T> {
  positiveId(actor.userId); positiveId(actor.sessionId);
  return db.transaction(async tx => {
    // Same first lock as canonical catalog/chapter writers. No network inside TX.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SHARED_CATALOG_ADVISORY_LOCK})`);
    const [account] = await tx.select({ active: users.isActive, role: users.role, name: users.displayName, expiresAt: sessions.expiresAt,
      emailVerifiedAt: users.emailVerifiedAt, verificationRequiredAt: users.verificationRequiredAt })
      .from(users).innerJoin(sessions, eq(sessions.userId, users.id))
      .where(and(eq(users.id, actor.userId), eq(sessions.id, actor.sessionId))).for("share");
    if (!account || !canUseFullAccountSession({ isActive: account.active, emailVerifiedAt: account.emailVerifiedAt,
      verificationRequiredAt: account.verificationRequiredAt })) throw new CommunityError(401, "unauthenticated");
    await tx.insert(controls).values({ userId: actor.userId }).onConflictDoNothing();
    const [control] = await tx.select().from(controls).where(eq(controls.userId, actor.userId)).for("update");
    const clock = await tx.execute<{ now: string }>(sql`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`);
    const now = new Date(clock.rows[0].now);
    if (account.expiresAt.getTime() <= now.getTime()) throw new CommunityError(401, "unauthenticated");
    if (admin && !hasPermission(account.role, "ADMIN_SECURITY")) forbidden();
    return action({ tx, now, actor, control, name: account.name });
  });
}
function requireUnrestricted(c: Context) {
  if (c.control.blockedUntil && c.control.blockedUntil > c.now) forbidden();
}
async function consume(c: Context, kind: "post" | "report" | "edit") {
  const windowMs = kind === "post" ? limits.postWindowMs : kind === "report" ? limits.reportWindowMs : limits.editWindowMs;
  const max = kind === "post" ? limits.postsPerWindow : kind === "report" ? limits.reportsPerWindow : limits.editsPerWindow;
  const oldAt = c.control[`${kind}WindowAt`], oldCount = c.control[`${kind}Count`];
  const reset = !oldAt || c.now.getTime() - oldAt.getTime() >= windowMs;
  const windowAt = reset ? c.now : oldAt!, count = reset ? 0 : oldCount;
  const gap = kind === "post" && c.control.lastPostAt ? limits.postIntervalMs - (c.now.getTime() - c.control.lastPostAt.getTime()) : 0;
  const wait = Math.max(gap, count >= max ? windowMs - (c.now.getTime() - windowAt.getTime()) : 0);
  if (wait > 0) throw new CommunityError(429, "rate_limited", Math.max(1, Math.ceil(wait / 1000)));
  await c.tx.update(controls).set({ [`${kind}WindowAt`]: windowAt, [`${kind}Count`]: count + 1,
    ...(kind === "post" ? { lastPostAt: c.now } : {}), updatedAt: c.now }).where(eq(controls.userId, c.actor.userId));
}
async function lockComment(c: Context, id: number) {
  positiveId(id);
  // Discovery is advisory; access and the locked row are checked again.
  const [hint] = await c.tx.select({ comicId: comments.comicId, chapterId: comments.chapterId }).from(comments).where(eq(comments.id, id));
  if (!hint) return notFound();
  await lockTarget(c.tx, hint);
  const [row] = await c.tx.select().from(comments).where(and(eq(comments.id, id), targetWhere(hint))).for("update");
  return row ?? notFound();
}

export async function listComments(target: Target, cursor: string | null = null, viewer: number | null = null): Promise<CommentPage> {
  const after = decodeCursor(cursor);
  return db.transaction(async tx => {
    await lockTarget(tx, target);
    const rows = await tx.select({ row: comments, name: users.displayName, active: users.isActive }).from(comments)
      .leftJoin(users, eq(users.id, comments.authorUserId)).where(and(targetWhere(target), after ?
        or(gt(comments.createdAt, after.at), and(eq(comments.createdAt, after.at), gt(comments.id, after.id))) : undefined))
      .orderBy(asc(comments.createdAt), asc(comments.id)).limit(limits.pageSize + 1);
    const [count] = await tx.select({ value: sql<number>`count(*) FILTER (WHERE ${comments.status} = 'VISIBLE')::int` })
      .from(comments).where(targetWhere(target));
    const more = rows.length > limits.pageSize, page = rows.slice(0, limits.pageSize), last = page.at(-1)?.row;
    return { items: page.map(r => dto(r.row, r.name, r.active ?? false, viewer)), visibleCount: count.value,
      nextCursor: more && last ? encodeCursor(last.createdAt, last.id) : null };
  }, { isolationLevel: "repeatable read" });
}

export async function createComment(actor: Actor, input: unknown) {
  const v = parseCreate(input);
  const digest = createHash("sha256").update(JSON.stringify([v.comicId, v.chapterId, v.parentId, v.body, v.spoiler])).digest("hex");
  return mutate(actor, async c => {
    await lockTarget(c.tx, v);
    const [prior] = await c.tx.select().from(comments).where(and(eq(comments.authorUserId, actor.userId), eq(comments.requestId, v.requestId)));
    if (prior) {
      if (prior.requestDigest !== digest) conflict();
      return { item: dto(prior, c.name, true, actor.userId), replay: true };
    }
    requireUnrestricted(c);
    if (v.parentId !== null) {
      const [parent] = await c.tx.select().from(comments).where(and(eq(comments.id, v.parentId), targetWhere(v))).for("update");
      if (!parent) notFound();
      if (parent.parentId !== null) throw new CommunityError(400, "reply_depth");
      if (parent.status !== "VISIBLE") conflict();
    }
    await consume(c, "post");
    const [row] = await c.tx.insert(comments).values({ ...v, authorUserId: actor.userId,
      requestDigest: digest, createdAt: c.now, updatedAt: c.now }).returning();
    return { item: dto(row, c.name, true, actor.userId), replay: false };
  });
}
export async function editComment(actor: Actor, id: number, input: unknown) {
  const v = parseEdit(input);
  return mutate(actor, async c => {
    requireUnrestricted(c); const row = await lockComment(c, id);
    if (row.authorUserId !== actor.userId) forbidden();
    if (row.status !== "VISIBLE") conflict();
    await consume(c, "edit");
    const [updated] = await c.tx.update(comments).set({ ...v, updatedAt: c.now, editedAt: c.now }).where(eq(comments.id, id)).returning();
    return dto(updated, c.name, true, actor.userId);
  });
}
export async function deleteComment(actor: Actor, id: number) {
  return mutate(actor, async c => {
    const row = await lockComment(c, id); if (row.authorUserId !== actor.userId) forbidden();
    if (row.status === "REMOVED_BY_AUTHOR") return dto(row, c.name, true, actor.userId);
    if (row.status !== "VISIBLE") conflict();
    const [updated] = await c.tx.update(comments).set({ body: null, spoiler: false, status: "REMOVED_BY_AUTHOR",
      deletedAt: c.now, updatedAt: c.now }).where(eq(comments.id, id)).returning();
    await c.tx.update(reports).set({ note: null }).where(eq(reports.commentId, id));
    return dto(updated, c.name, true, actor.userId);
  });
}
export async function reportComment(actor: Actor, id: number, input: unknown) {
  const v = parseReport(input);
  return mutate(actor, async c => {
    requireUnrestricted(c); const row = await lockComment(c, id);
    if (row.authorUserId === actor.userId) throw new CommunityError(400, "own_report");
    if (row.status !== "VISIBLE") conflict();
    const [prior] = await c.tx.select({ id: reports.id }).from(reports).where(and(eq(reports.commentId, id), eq(reports.reporterUserId, actor.userId)));
    if (prior) return { ok: true, replay: true };
    await consume(c, "report");
    await c.tx.insert(reports).values({ ...v, commentId: id, reporterUserId: actor.userId, createdAt: c.now });
    return { ok: true, replay: false };
  });
}

export async function moderate(actor: Actor, input: unknown) {
  const v = parseModeration(input);
  return mutate(actor, async c => {
    requireUnrestricted(c);
    let commentId: number | null = null, reportId: number | null = null, targetUserId: number | null = null;
    if (v.action === "HIDE" || v.action === "RESTORE") {
      const row = await lockComment(c, v.commentId!); commentId = row.id;
      if (row.status === "REMOVED_BY_AUTHOR") conflict();
      const status = v.action === "HIDE" ? "HIDDEN_BY_MODERATOR" : "VISIBLE";
      if (row.status === status) return { ok: true };
      await c.tx.update(comments).set({ status, updatedAt: c.now }).where(eq(comments.id, row.id));
    } else if (v.action === "RESOLVE" || v.action === "REJECT") {
      const [hint] = await c.tx.select({ commentId: reports.commentId }).from(reports).where(eq(reports.id, v.reportId!));
      if (!hint) notFound();
      const row = await lockComment(c, hint.commentId); commentId = row.id; reportId = v.reportId!;
      const [report] = await c.tx.select().from(reports).where(eq(reports.id, reportId)).for("update");
      if (!report) notFound(); if (report.status !== "OPEN") return { ok: true };
      await c.tx.update(reports).set({ status: v.action === "RESOLVE" ? "RESOLVED" : "REJECTED", resolvedAt: c.now,
        moderatorUserId: actor.userId }).where(eq(reports.id, reportId));
    } else {
      targetUserId = v.userId!;
      const [user] = await c.tx.select({ id: users.id }).from(users).where(eq(users.id, targetUserId));
      if (!user) notFound();
      if (v.action === "RESTRICT" && (!v.until || v.until <= c.now || v.until.getTime() - c.now.getTime() > limits.restrictionMaxMs)) {
        throw new CommunityError(400, "invalid_expiry");
      }
      await c.tx.insert(controls).values({ userId: targetUserId }).onConflictDoNothing();
      await c.tx.update(controls).set({ blockedUntil: v.action === "RESTRICT" ? v.until : null, reason: v.reason,
        moderatorUserId: actor.userId, updatedAt: c.now }).where(eq(controls.userId, targetUserId));
    }
    await c.tx.insert(events).values({ action: v.action, actorUserId: actor.userId, commentId, reportId, targetUserId,
      reason: v.reason, createdAt: c.now });
    return { ok: true };
  }, true);
}

export async function moderationQueue(actor: Actor, status = "OPEN", cursor: string | null = null) {
  if (!["OPEN", "RESOLVED", "REJECTED", "ALL"].includes(status)) throw new CommunityError(400, "invalid_request");
  const after = decodeCursor(cursor);
  return mutate(actor, async c => {
    requireUnrestricted(c);
    const rows = await c.tx.select({ report: reports, comment: comments, author: users.displayName, active: users.isActive,
      slug: comics.slug, title: comics.title, blockedUntil: controls.blockedUntil }).from(reports)
      .innerJoin(comments, eq(comments.id, reports.commentId)).innerJoin(comics, eq(comics.id, comments.comicId))
      .leftJoin(chapters, eq(chapters.id, comments.chapterId)).leftJoin(users, eq(users.id, comments.authorUserId))
      .leftJoin(controls, eq(controls.userId, comments.authorUserId))
      .where(and(eq(comics.visibility, "SHARED"), eq(comics.publicationStatus, "PUBLISHED"),
        or(isNull(comments.chapterId), and(eq(chapters.comicId, comments.comicId), eq(chapters.status, "RELEASED"))),
        status === "ALL" ? undefined : eq(reports.status, status), after ? or(gt(reports.createdAt, after.at),
          and(eq(reports.createdAt, after.at), gt(reports.id, after.id))) : undefined))
      .orderBy(asc(reports.createdAt), asc(reports.id)).limit(limits.pageSize + 1);
    const more = rows.length > limits.pageSize, page = rows.slice(0, limits.pageSize), last = page.at(-1)?.report;
    const audit = await c.tx.select({ id: events.id, action: events.action, commentId: events.commentId,
      reportId: events.reportId, targetUserId: events.targetUserId, reason: events.reason, createdAt: events.createdAt })
      .from(events).orderBy(desc(events.createdAt), desc(events.id)).limit(20);
    return { items: page.map(r => ({ id: r.report.id, commentId: r.comment.id, authorUserId: r.comment.authorUserId,
      author: publicAlias(r.author, r.active ?? false), comicId: r.comment.comicId, chapterId: r.comment.chapterId,
      title: r.title, slug: r.slug, body: r.comment.status === "REMOVED_BY_AUTHOR" ? null : r.comment.body,
      commentStatus: r.comment.status, reason: r.report.reason, note: r.comment.status === "REMOVED_BY_AUTHOR" ? null : r.report.note,
      status: r.report.status, createdAt: r.report.createdAt.toISOString(), blockedUntil: r.blockedUntil?.toISOString() ?? null })),
      nextCursor: more && last ? encodeCursor(last.createdAt, last.id) : null,
      audit: audit.map(e => ({ ...e, createdAt: e.createdAt.toISOString() })) };
  }, true);
}
export type ModerationPage = Awaited<ReturnType<typeof moderationQueue>>;
