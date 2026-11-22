import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { normalizeAvatar, parseCrop, MAX_AVATAR_BYTES } from './avatar-storage';
import { initials, strictObject, revisionValue } from './policy';
test('crop accepts integer square coordinates and rejects injected, missing and invalid values', () => {
  assert.deepEqual(parseCrop({ left: 0, top: 10, size: 64 }), {
    left: 0,
    top: 10,
    size: 64,
  });
  for (const v of [
    { left: -1, top: 0, size: 64 },
    { left: 0, top: 0, size: 63 },
    { left: 0, top: 0, size: 64, userId: 2 },
    { left: 0.1, top: 0, size: 64 },
    null,
  ])
    assert.throws(() => parseCrop(v));
  for (const v of [-1, NaN, Infinity, 1.1, '1'])
    assert.throws(() => revisionValue(v));
  assert.equal(initials('  Анна Белая '), 'АБ');
  assert.equal(initials('😀 Читатель'), '😀Ч');
  assert.throws(() => strictObject({ frame: null, userId: 2 }, ['frame']));
});
for (const format of ['png', 'jpeg', 'webp'] as const)
  test(
    format + ' is decoded, cropped and re-encoded to 256 WebP without metadata',
    async () => {
      const input = await sharp({
        create: { width: 160, height: 100, channels: 3, background: '#db8b22' },
      })
        .toFormat(format)
        .withMetadata({ orientation: 1 })
        .toBuffer();
      const output = await normalizeAvatar(input, {
        left: 20,
        top: 0,
        size: 100,
      });
      const m = await sharp(output).metadata();
      assert.equal(m.format, 'webp');
      assert.equal(m.width, 256);
      assert.equal(m.height, 256);
      assert.equal(m.exif, undefined);
      assert.equal(m.icc, undefined);
    },
  );
test('EXIF orientation is applied before crop coordinates and removed from saved image', async () => {
  const input = await sharp({
    create: { width: 160, height: 80, channels: 3, background: '#aa0000' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  await normalizeAvatar(input, { left: 0, top: 70, size: 80 });
  await assert.rejects(normalizeAvatar(input, { left: 70, top: 0, size: 80 }), {
    kind: 'invalid_crop',
  });
});
test('fake signatures, SVG, empty/truncated uploads, oversized files, crop outside image and pixel bombs fail closed', async () => {
  for (const bytes of [
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    Buffer.from('not an image'),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  ])
    await assert.rejects(normalizeAvatar(bytes, { left: 0, top: 0, size: 64 }));
  await assert.rejects(
    normalizeAvatar(Buffer.alloc(MAX_AVATAR_BYTES + 1), {
      left: 0,
      top: 0,
      size: 64,
    }),
    { status: 413 },
  );
  const input = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#000000' },
  })
    .png()
    .toBuffer();
  await assert.rejects(normalizeAvatar(input, { left: 1, top: 0, size: 64 }), {
    kind: 'invalid_crop',
  });
  const large = await sharp({
    create: { width: 4100, height: 4100, channels: 3, background: '#000000' },
  })
    .png()
    .toBuffer();
  await assert.rejects(normalizeAvatar(large, { left: 0, top: 0, size: 64 }), {
    kind: 'invalid_image',
  });
});

test('approved beta frame is transparent lossless WebP with original decoded RGBA pixels', async () => {
  const image = sharp('public/avatar-frames/beta-dragon-2026.webp');
  const m = await image.metadata();
  assert.equal(m.format, 'webp');
  assert.equal(m.hasAlpha, true);
  assert.equal(m.width, 1254);
  assert.equal(m.height, 1254);
  const pixels = await image.ensureAlpha().raw().toBuffer();
  assert.equal(
    createHash('sha256').update(pixels).digest('hex'),
    'f7e54f322948c1411c72dc6a7f03664e73665cbb9e0e4941db3e7b90bbc41e5d',
  );
  assert.equal(pixels[(750 * 1254 + 600) * 4 + 3], 0);
  assert.equal(pixels[3], 0);
});
