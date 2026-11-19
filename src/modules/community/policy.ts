export const COMMUNITY_LIMITS = { bodyBytes: 16 * 1024, textPoints: 2000, pageSize: 20,
  postIntervalMs: 15_000, postWindowMs: 3_600_000, postsPerWindow: 20,
  reportWindowMs: 600_000, reportsPerWindow: 5, editWindowMs: 60_000, editsPerWindow: 20,
  restrictionMaxMs: 30 * 24 * 3_600_000 } as const;
export const REPORT_REASONS = ["SPAM", "INSULT", "SPOILER", "OTHER"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type Target = { comicId: number; chapterId: number | null };
export type Actor = { userId: number; sessionId: number };
export type CreateComment = Target & { parentId: number | null; body: string; spoiler: boolean; requestId: string };
export type CommentStatus = "VISIBLE" | "REMOVED_BY_AUTHOR" | "HIDDEN_BY_MODERATOR";
export type PublicComment = { id: number; parentId: number | null; author: string; mine: boolean;
  body: string | null; spoiler: boolean; status: CommentStatus; createdAt: string; editedAt: string | null };
export type CommentPage = { items: PublicComment[]; nextCursor: string | null; visibleCount: number };

export class CommunityError extends Error {
  constructor(readonly status: number, readonly code: string, readonly retryAfter?: number) { super(code); }
}
export function invalid(): never { throw new CommunityError(400, "invalid_request"); }
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
export function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some(k => !allowed.includes(k))) invalid();
}
export function positiveId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > 2147483647) return invalid();
  return value;
}
export function queryId(value: string | null): number {
  if (!value || !/^[1-9][0-9]{0,9}$/.test(value)) return invalid();
  return positiveId(Number(value));
}
export function textValue(value: unknown, max: number = COMMUNITY_LIMITS.textPoints): string {
  if (typeof value !== "string") return invalid();
  const text = value.replace(/\r\n?/g, "\n").trim();
  const points = Array.from(text);
  if (!points.length || points.length > max || !text.replace(/[\s\p{Cf}\p{Cc}]/gu, "") ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text) ||
      points.some(c => c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff)) return invalid();
  return text;
}
export function parseCreate(value: unknown): CreateComment {
  const v = record(value); exactKeys(v, ["comicId", "chapterId", "parentId", "body", "spoiler", "requestId"]);
  const chapterId = v.chapterId == null ? null : positiveId(v.chapterId);
  if (v.spoiler !== undefined && typeof v.spoiler !== "boolean") return invalid();
  if (typeof v.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.requestId)) return invalid();
  return { comicId: positiveId(v.comicId), chapterId, parentId: v.parentId == null ? null : positiveId(v.parentId),
    body: textValue(v.body), spoiler: v.spoiler ?? chapterId !== null, requestId: v.requestId.toLowerCase() };
}
export function parseEdit(value: unknown) {
  const v = record(value); exactKeys(v, ["body", "spoiler"]);
  if (typeof v.spoiler !== "boolean") return invalid();
  return { body: textValue(v.body), spoiler: v.spoiler };
}
export function parseReport(value: unknown) {
  const v = record(value); exactKeys(v, ["reason", "note"]);
  if (!REPORT_REASONS.includes(v.reason as ReportReason)) return invalid();
  return { reason: v.reason as ReportReason, note: v.note == null || v.note === "" ? null : textValue(v.note, 300) };
}
export function publicAlias(name: string | null, active: boolean): string {
  if (!active || !name || name.includes("@")) return "Читатель";
  return Array.from(name.replace(/[\p{Cf}\p{Cc}]/gu, "").trim()).slice(0, 80).join("") || "Читатель";
}
export function encodeCursor(at: Date, id: number): string {
  return Buffer.from(JSON.stringify([at.toISOString(), positiveId(id)])).toString("base64url");
}
export function decodeCursor(value: string | null): { at: Date; id: number } | null {
  if (value === null) return null;
  try {
    if (value.length > 150 || !/^[A-Za-z0-9_-]+$/.test(value)) return invalid();
    const tuple: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(tuple) || tuple.length !== 2 || typeof tuple[0] !== "string") return invalid();
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(tuple[0])) return invalid();
    const at = new Date(tuple[0]), id = positiveId(tuple[1]);
    if (at.getUTCFullYear() < 1) return invalid();
    if (!Number.isFinite(at.getTime()) || encodeCursor(at, id) !== value) return invalid();
    return { at, id };
  } catch { return invalid(); }
}
export function targetQuery(params: URLSearchParams): Target {
  for (const key of params.keys()) if (!["comicId", "chapterId", "cursor"].includes(key) || params.getAll(key).length !== 1) invalid();
  return { comicId: queryId(params.get("comicId")), chapterId: params.has("chapterId") ? queryId(params.get("chapterId")) : null };
}
export type ModerationAction = { action: "HIDE" | "RESTORE" | "RESOLVE" | "REJECT" | "RESTRICT" | "UNRESTRICT";
  reason: string; commentId?: number; reportId?: number; userId?: number; until?: Date };
export function parseModeration(value: unknown): ModerationAction {
  const v = record(value), action = v.action;
  const reason = textValue(v.reason, 500);
  if (action === "HIDE" || action === "RESTORE") {
    exactKeys(v, ["action", "reason", "commentId"]); return { action, reason, commentId: positiveId(v.commentId) };
  }
  if (action === "RESOLVE" || action === "REJECT") {
    exactKeys(v, ["action", "reason", "reportId"]); return { action, reason, reportId: positiveId(v.reportId) };
  }
  if (action === "RESTRICT" || action === "UNRESTRICT") {
    exactKeys(v, action === "RESTRICT" ? ["action", "reason", "userId", "until"] : ["action", "reason", "userId"]);
    if (action === "UNRESTRICT") return { action, reason, userId: positiveId(v.userId) };
    if (typeof v.until !== "string") return invalid();
    const until = new Date(v.until);
    if (!Number.isFinite(until.getTime()) || until.toISOString() !== v.until) return invalid();
    return { action, reason, userId: positiveId(v.userId), until };
  }
  return invalid();
}
