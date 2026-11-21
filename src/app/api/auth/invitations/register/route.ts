import type { NextRequest } from 'next/server';
import { InvitationError } from '@/modules/auth/beta-invitation-admin';
import {
  registerWithBetaInvitation,
  betaRegistrationOperational,
} from '@/modules/auth/beta-invitation-service';
import {
  invitationJson,
  invitationIp,
  invitationResponse,
} from '@/modules/auth/beta-invitation-http';
export function POST(request: NextRequest) {
  return invitationResponse(async () => {
    const v = await invitationJson(request);
    if (!betaRegistrationOperational(process.env))
      throw new InvitationError(503, 'registration_unavailable');
    await invitationIp(request);
    return registerWithBetaInvitation(v);
  }, 202);
}
