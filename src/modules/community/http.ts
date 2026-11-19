import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/modules/auth/request-identity";
import { isSameOriginRequest } from "@/modules/auth/request-origin";
import { COMMUNITY_LIMITS, CommunityError, queryId, targetQuery, type Actor } from "./policy";
import { createComment, editComment, deleteComment, listComments, reportComment, moderate, moderationQueue } from "./service";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
export async function readEmptyBody(request: Request): Promise<void> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > COMMUNITY_LIMITS.bodyBytes)) throw new CommunityError(413, "too_large");
  const reader = request.body?.getReader();
  if (!reader) return;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) return;
      if (part.value.byteLength > 0) {
        await reader.cancel();
        throw new CommunityError(part.value.byteLength > COMMUNITY_LIMITS.bodyBytes ? 413 : 400, "invalid_request");
      }
    }
  } finally { reader.releaseLock(); }
}
export async function readBoundedJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new CommunityError(415, "unsupported_media");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > COMMUNITY_LIMITS.bodyBytes)) throw new CommunityError(413, "too_large");
  if (!request.body) throw new CommunityError(400, "invalid_request");
  const reader = request.body.getReader(); let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > COMMUNITY_LIMITS.bodyBytes) { await reader.cancel(); throw new CommunityError(413, "too_large"); }
      chunks.push(part.value);
    }
    const bytes = Buffer.concat(chunks);
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
    catch { throw new CommunityError(400, "invalid_request"); }
  } finally { reader.releaseLock(); }
}
async function respond(action: () => Promise<{ body: unknown; status?: number }>) {
  try { const result = await action(); return NextResponse.json(result.body, { status: result.status ?? 200, headers }); }
  catch (error) {
    const e = error instanceof CommunityError ? error : new CommunityError(503, "unavailable");
    return NextResponse.json({ error: e.code }, { status: e.status,
      headers: { ...headers, ...(e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {}) } });
  }
}
async function identity(): Promise<Actor> {
  const session = await getCurrentSession();
  if (!session) throw new CommunityError(401, "unauthenticated");
  return { userId: session.user.id, sessionId: session.sessionId };
}
async function mutation(request: NextRequest, action: (actor: Actor, body: unknown) => Promise<{ body: unknown; status?: number }>, empty = false) {
  return respond(async () => {
    // Rejected origin cannot parse a body or resolve a session/DB connection.
    if (!isSameOriginRequest(request)) throw new CommunityError(403, "forbidden_origin");
    if (empty) await readEmptyBody(request);
    const body = empty ? null : await readBoundedJson(request);
    return action(await identity(), body);
  });
}
export function commentsGet(request: NextRequest) {
  return respond(async () => {
    const target = targetQuery(request.nextUrl.searchParams);
    const session = await getCurrentSession();
    return { body: await listComments(target, request.nextUrl.searchParams.get("cursor"), session?.user.id ?? null) };
  });
}
export function commentsPost(request: NextRequest) {
  return mutation(request, async (actor, body) => {
    const result = await createComment(actor, body); return { body: result, status: result.replay ? 200 : 201 };
  });
}
export function commentPatch(request: NextRequest, id: string) {
  return mutation(request, async (actor, body) => ({ body: { item: await editComment(actor, queryId(id), body) } }));
}
export function commentDelete(request: NextRequest, id: string) {
  return mutation(request, async actor => ({ body: { item: await deleteComment(actor, queryId(id)) } }), true);
}
export function commentReport(request: NextRequest, id: string) {
  return mutation(request, async (actor, body) => {
    const result = await reportComment(actor, queryId(id), body); return { body: result, status: result.replay ? 200 : 201 };
  });
}
export function adminCommentsGet(request: NextRequest) {
  return respond(async () => {
    for (const key of request.nextUrl.searchParams.keys()) if (!["status", "cursor"].includes(key) || request.nextUrl.searchParams.getAll(key).length !== 1) throw new CommunityError(400, "invalid_request");
    return { body: await moderationQueue(await identity(), request.nextUrl.searchParams.get("status") ?? "OPEN", request.nextUrl.searchParams.get("cursor")) };
  });
}
export function adminCommentsPost(request: NextRequest) {
  return mutation(request, async (actor, body) => ({ body: await moderate(actor, body) }));
}
