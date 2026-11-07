// 画像を検証し、メタデータを除去した WebP に再エンコードする(FR-015、FR-037)
import sharp from 'sharp';
import { IMAGE_MAX_BYTES } from '@diary/shared';
import { errors } from './errors.ts';

const MAX_PIXELS = 50_000_000;
const LONG_SIDE = { diary: 1600, avatar: 400 } as const;
const ACCEPTED = new Set(['jpeg', 'png', 'webp']);

export async function processImage(input: Buffer, kind: keyof typeof LONG_SIDE): Promise<Buffer> {
  if (input.length > IMAGE_MAX_BYTES) throw errors.payloadTooLarge();

  let format: string | undefined;
  let pixels: number;
  try {
    const meta = await sharp(input, { limitInputPixels: false }).metadata();
    format = meta.format;
    pixels = meta.width * meta.height;
  } catch {
    throw errors.unsupportedMedia('画像として読み込めないファイルです');
  }
  if (!format || !ACCEPTED.has(format)) throw errors.unsupportedMedia('JPEG、PNG、WebP のみ対応しています');
  if (pixels > MAX_PIXELS) throw errors.invalidImage('画像の解像度が大きすぎます');

  const size = LONG_SIDE[kind];
  try {
    // rotate() で向きを反映し、出力時にメタデータ(位置情報など)は付与しない
    return await sharp(input, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw errors.invalidImage('画像を処理できませんでした');
  }
}
