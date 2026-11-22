import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AVATAR_FILENAME, AppearanceError, strictObject } from './policy';
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const MAX_AVATAR_PIXELS = 16_000_000;
export type Crop = { left: number; top: number; size: number };
export function avatarPath(name: string) {
  if (!AVATAR_FILENAME.test(name)) throw new AppearanceError(404, 'not_found');
  return path.join(
    process.env.MEDIA_ROOT?.trim() || path.join(process.cwd(), '.media'),
    'avatars',
    name,
  );
}
export function parseCrop(raw: unknown): Crop {
  const v = strictObject(raw, ['left', 'top', 'size']);
  if (
    !['left', 'top', 'size'].every(
      (k) => typeof v[k] === 'number' && Number.isSafeInteger(v[k]),
    ) ||
    Number(v.left) < 0 ||
    Number(v.top) < 0 ||
    Number(v.size) < 64
  )
    throw new AppearanceError(400, 'invalid_crop');
  return v as Crop;
}
export async function normalizeAvatar(bytes: Uint8Array, crop: Crop) {
  if (!bytes.length || bytes.length > MAX_AVATAR_BYTES)
    throw new AppearanceError(413, 'image_too_large');
  const signature = Buffer.from(bytes.subarray(0, 12));
  if (
    !(signature[0] === 255 && signature[1] === 216 && signature[2] === 255) &&
    !signature
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    !(
      signature.toString('ascii', 0, 4) === 'RIFF' &&
      signature.toString('ascii', 8, 12) === 'WEBP'
    )
  )
    throw new AppearanceError(415, 'unsupported_image');
  try {
    const image = sharp(bytes, {
      limitInputPixels: MAX_AVATAR_PIXELS,
      failOn: 'warning',
      animated: false,
    });
    const m = await image.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(m.format ?? '') ||
      (m.pages ?? 1) !== 1 ||
      !m.width ||
      !m.height
    )
      throw new AppearanceError(415, 'unsupported_image');
    // Apply orientation before coordinates; output strips EXIF/GPS and all original metadata.
    const rotated = await image.autoOrient().toBuffer();
    const oriented = sharp(rotated, { limitInputPixels: MAX_AVATAR_PIXELS });
    const meta = await oriented.metadata();
    if (
      crop.left + crop.size > meta.width! ||
      crop.top + crop.size > meta.height!
    )
      throw new AppearanceError(400, 'invalid_crop');
    return await oriented
      .extract({
        left: crop.left,
        top: crop.top,
        width: crop.size,
        height: crop.size,
      })
      .resize(256, 256, { fit: 'fill' })
      .webp({ quality: 88, effort: 4 })
      .toBuffer();
  } catch (e) {
    if (e instanceof AppearanceError) throw e;
    throw new AppearanceError(400, 'invalid_image');
  }
}
export async function storeAvatar(bytes: Uint8Array, crop: Crop) {
  const normalized = await normalizeAvatar(bytes, crop);
  const filename = randomUUID() + '.webp';
  const file = avatarPath(filename);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, normalized, { flag: 'wx', mode: 0o600 });
  return filename;
}
