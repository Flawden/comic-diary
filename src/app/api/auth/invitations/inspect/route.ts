import type { NextRequest } from 'next/server';
import { InvitationError } from '@/modules/auth/beta-invitation-admin';
import {
  inspectBetaInvitation,
  betaRegistrationOperational,
} from '@/modules/auth/beta-invitation-service';
import {
  invitationFields,
  invitationJson,
  invitationIp,
  invitationResponse,
} from '@/modules/auth/beta-invitation-http';
export function POST(request: NextRequest) {
  return invitationResponse(async () => {
    const v = invitationFields(await invitationJson(request), ['invitation']);
    if (!betaRegistrationOperational(process.env))
      throw new InvitationError(503, 'registration_unavailable');
    await invitationIp(request);
    return inspectBetaInvitation(v.invitation);
  });
}
