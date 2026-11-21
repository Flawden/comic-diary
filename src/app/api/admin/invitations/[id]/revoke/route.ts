import type { NextRequest } from 'next/server';
import {
  revokeBetaInvitation,
  InvitationError,
} from '@/modules/auth/beta-invitation-admin';
import {
  invitationActor,
  invitationFields,
  invitationJson,
  invitationResponse,
} from '@/modules/auth/beta-invitation-http';
export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return invitationResponse(async () => {
    invitationFields(await invitationJson(request), []);
    const { id } = await params;
    if (!/^[1-9][0-9]{0,9}$/.test(id) || Number(id) > 2147483647)
      throw new InvitationError(400, 'invalid_request');
    return revokeBetaInvitation(await invitationActor(), Number(id));
  });
}
