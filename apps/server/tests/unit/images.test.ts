import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processImage } from '../../src/platform/images.ts';
import { AppError } from '../../src/platform/errors.ts';
import { makeImage, makeJpegWithGps } from '../helpers/images.ts';

async function expectAppError(promise: Promise<unknown>, status: number) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).status).toBe(status);
}

describe('processImage', () => {
  it.each(['jpeg', 'png', 'webp'] as const)('re-encodes %s to WebP', async (format) => {
    const out = await processImage(await makeImage(format), 'diary');
    expect((await sharp(out).metadata()).format).toBe('webp');
  });

  it('rejects unsupported formats', async () => {
    await expectAppError(processImage(await makeImage('gif'), 'diary'), 415);
  });

  it('rejects files that are not really images', async () => {
    await expectAppError(processImage(Buffer.from('this is a text file, not a jpeg'), 'diary'), 415);
  });

  it('rejects files larger than 10MB', async () => {
    await expectAppError(processImage(Buffer.alloc(10 * 1024 * 1024 + 1), 'diary'), 413);
  });

  it('rejects images over 50 million pixels', async () => {
    const huge = await sharp({ create: { width: 8000, height: 7000, channels: 3, background: '#fff' } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expectAppError(processImage(huge, 'diary'), 422);
  });

  it('removes GPS and camera metadata', async () => {
    const input = await makeJpegWithGps();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await processImage(input, 'diary');
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(out.includes(Buffer.from('TestCamera'))).toBe(false);
  });

  it('limits the long side to 1600px for diaries and 400px for avatars', async () => {
    const diary = await sharp(await processImage(await makeImage('png', 3000, 2000), 'diary')).metadata();
    expect([diary.width, diary.height]).toEqual([1600, 1067]);
    const avatar = await sharp(await processImage(await makeImage('png', 1000, 1000), 'avatar')).metadata();
    expect([avatar.width, avatar.height]).toEqual([400, 400]);
  });

  it('does not enlarge small images', async () => {
    const out = await sharp(await processImage(await makeImage('png', 100, 80), 'diary')).metadata();
    expect([out.width, out.height]).toEqual([100, 80]);
  });
});
