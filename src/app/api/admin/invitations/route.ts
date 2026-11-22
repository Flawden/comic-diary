import type { NextRequest } from 'next/server';
import {
  createBetaInvitation,
  listBetaInvitations,
  InvitationError,
} from '@/modules/auth/beta-invitation-admin';
import {
  invitationActor,
  invitationFields,
  invitationJson,
  invitationResponse,
} from '@/modules/auth/beta-invitation-http';
export function GET(request: NextRequest) {
  return invitationResponse(async () => {
    const q = request.nextUrl.searchParams;
    if (
      [...q.keys()].some((k) => k !== 'before') ||
      q.getAll('before').length > 1
    )
      throw new InvitationError(400, 'invalid_request');
    const before = q.get('before');
    if (
      before !== null &&
      (!/^[1-9][0-9]{0,9}$/.test(before) || Number(before) > 2147483647)
    )
      throw new InvitationError(400, 'invalid_request');
    return listBetaInvitations(
      await invitationActor(),
      before ? Number(before) : undefined,
    );
  });
}
export function POST(request: NextRequest) {
  return invitationResponse(async () => {
    const raw=await invitationJson(request);
    const hasBeta=raw!==null && typeof raw==='object' && 'grantsBeta' in raw;
    const v = invitationFields(raw,hasBeta?['email','grantsBeta']:['email']);
    if(hasBeta && typeof v.grantsBeta!=='boolean') throw new InvitationError(400,'invalid_request');
    const origin = process.env.COMIC_DIARY_PUBLIC_ORIGIN;
    if (
      !origin ||
      new URL(origin).origin !== origin ||
      !origin.startsWith('https://')
    )
      throw new InvitationError(503, 'unavailable');
    const made = await createBetaInvitation(await invitationActor(), v.email, v.grantsBeta===true);
    return {
      id: made.id,
      expiresAt: made.expiresAt,
      link: origin + '/register#invite=' + made.secret,
    };
  }, 201);
}
