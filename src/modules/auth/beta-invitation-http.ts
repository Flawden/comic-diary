import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentSession } from './request-identity';
import { isSameOriginRequest } from './request-origin';
import { readRegistrationActivationBody } from './registration-activation-http';
import { readTrustedClientIp } from './client-ip';
import { consumeRegistrationRateLimit } from './auth-rate-limit';
import { InvitationError, type InvitationActor } from './beta-invitation-admin';
export const invitationHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  Vary: 'Cookie',
};
export async function invitationResponse(
  action: () => Promise<unknown>,
  status = 200,
) {
  try {
    return NextResponse.json(await action(), {
      status,
      headers: invitationHeaders,
    });
  } catch (e) {
    const known = e instanceof InvitationError;
    return NextResponse.json(
      { error: known ? e.kind : 'unavailable' },
      { status: known ? e.status : 503, headers: invitationHeaders },
    );
  }
}
export async function invitationActor(): Promise<InvitationActor> {
  const session = await getCurrentSession();
  if (!session) throw new InvitationError(401, 'unauthorized');
  return { userId: session.user.id, sessionId: session.sessionId };
}
export async function invitationJson(request: NextRequest) {
  if (!isSameOriginRequest(request))
    throw new InvitationError(403, 'forbidden_origin');
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  )
    throw new InvitationError(415, 'unsupported_media_type');
  const read = await readRegistrationActivationBody(request);
  if (!read.ok)
    throw new InvitationError(
      read.reason === 'request_too_large' ? 413 : 400,
      read.reason,
    );
  try {
    return JSON.parse(read.raw) as unknown;
  } catch {
    throw new InvitationError(400, 'invalid_request');
  }
}
export function invitationFields(input: unknown, fields: string[]) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).length !== fields.length ||
    Object.keys(input).some((k) => !fields.includes(k))
  )
    throw new InvitationError(400, 'invalid_request');
  return input as Record<string, unknown>;
}
export async function invitationIp(request: NextRequest) {
  const ip = readTrustedClientIp(request.headers);
  if (!ip) throw new InvitationError(503, 'rate_limit_unavailable');
  const limit = await consumeRegistrationRateLimit(ip);
  if (!limit.allowed) throw new InvitationError(429, 'rate_limited');
}
