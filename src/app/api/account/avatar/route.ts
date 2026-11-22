import type { NextRequest } from 'next/server';
import { actor, boundedBody, envelope } from '@/modules/appearance/http';
import { AppearanceError, revisionValue } from '@/modules/appearance/policy';
import {
  MAX_AVATAR_BYTES,
  parseCrop,
  storeAvatar,
} from '@/modules/appearance/avatar-storage';
import { setOwnAvatar } from '@/modules/appearance/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function revision(r: Request) {
  const v = r.headers.get('if-match');
  if (!v || !/^\d+$/.test(v))
    throw new AppearanceError(400, 'invalid_revision');
  return revisionValue(Number(v));
}
export function POST(request: NextRequest) {
  return envelope(async () => {
    const who = await actor(request);
    const version = revision(request);
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(
        request.headers.get('content-type') ?? '',
      )
    )
      throw new AppearanceError(415, 'unsupported_media_type');
    let raw: unknown;
    try {
      raw = JSON.parse(request.headers.get('x-avatar-crop') ?? '');
    } catch {
      throw new AppearanceError(400, 'invalid_crop');
    }
    const crop = parseCrop(raw);
    const bytes = await boundedBody(request, MAX_AVATAR_BYTES);
    const file = await storeAvatar(bytes, crop);
    // Never delete after an uncertain commit: the file may already be referenced.
    // Unreferenced files cannot be served by the media route; originals are never stored.
    return setOwnAvatar(who, file, version);
  });
}
export function DELETE(request: NextRequest) {
  return envelope(async () =>
    setOwnAvatar(await actor(request), null, revision(request)),
  );
}
