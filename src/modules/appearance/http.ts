import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentSession } from '@/modules/auth/request-identity';
import { isSameOriginRequest } from '@/modules/auth/request-origin';
import { consumeAuthRateLimit } from '@/modules/auth/auth-rate-limit';
import { AppearanceError } from './policy';
export const response = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
export async function envelope(action: () => Promise<unknown>) {
  try {
    return response(await action());
  } catch (e) {
    if (e instanceof AppearanceError)
      return response({ error: e.kind }, e.status);
    return response({ error: 'appearance_unavailable' }, 503);
  }
}
export async function actor(request: NextRequest, admin = false) {
  if (!isSameOriginRequest(request))
    throw new AppearanceError(403, 'forbidden_origin');
  const s = await getCurrentSession();
  if (!s) throw new AppearanceError(401, 'unauthorized');
  if (admin && s.user.role !== 'ADMIN')
    throw new AppearanceError(403, 'forbidden');
  const limit = await consumeAuthRateLimit({
    scope: admin ? 'appearance-admin-v1' : 'appearance-own-v1',
    identity: String(s.user.id),
    maxRequests: admin ? 100 : 20,
    windowMs: 3600000,
  });
  if (!limit.allowed) throw new AppearanceError(429, 'rate_limited');
  return { userId: s.user.id, sessionId: s.sessionId };
}
export async function boundedBody(request: Request, max: number) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > max))
    throw new AppearanceError(413, 'body_too_large');
  const reader = request.body?.getReader();
  if (!reader) throw new AppearanceError(400, 'invalid_request');
  const chunks: Uint8Array[] = [];
  let lengthRead = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      lengthRead += value.length;
      if (lengthRead > max) {
        await reader.cancel();
        throw new AppearanceError(413, 'body_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, lengthRead);
}
export async function jsonBody(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    throw new AppearanceError(415, 'unsupported_media_type');
  try {
    return JSON.parse((await boundedBody(request, 2048)).toString('utf8'));
  } catch (e) {
    if (e instanceof AppearanceError) throw e;
    throw new AppearanceError(400, 'invalid_request');
  }
}
