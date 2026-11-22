import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/modules/auth/request-identity';
import { actor, envelope, jsonBody } from '@/modules/appearance/http';
import {
  AppearanceError,
  strictObject,
  revisionValue,
} from '@/modules/appearance/policy';
import { ownAppearance, selectOwnFrame } from '@/modules/appearance/service';
export const dynamic = 'force-dynamic';
export function GET() {
  return envelope(async () => {
    const u = await getCurrentUser();
    if (!u) throw new AppearanceError(401, 'unauthorized');
    return ownAppearance(u.id);
  });
}
export function POST(request: NextRequest) {
  return envelope(async () => {
    const who = await actor(request);
    const v = strictObject(await jsonBody(request), ['frame', 'revision']);
    return selectOwnFrame(who, v.frame, revisionValue(v.revision));
  });
}
