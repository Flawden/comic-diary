import type { NextRequest } from 'next/server';
import { actor, envelope, jsonBody } from '@/modules/appearance/http';
import {
  AppearanceError,
  strictObject,
  revisionValue,
} from '@/modules/appearance/policy';
import { setBetaAccess } from '@/modules/appearance/service';
export const dynamic = 'force-dynamic';
export function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return envelope(async () => {
    const who = await actor(request, true);
    const { id: userId } = await context.params;
    if (!/^[1-9]\d*$/.test(userId))
      throw new AppearanceError(400, 'invalid_user');
    const v = strictObject(await jsonBody(request), [
      'betaParticipant',
      'betaFrameGranted',
      'revision',
    ]);
    return setBetaAccess(
      who,
      Number(userId),
      v.betaParticipant,
      v.betaFrameGranted,
      revisionValue(v.revision),
    );
  });
}
