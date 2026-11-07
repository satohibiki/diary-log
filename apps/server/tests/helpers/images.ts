// テスト用の画像を生成する
import sharp from 'sharp';

export async function makeImage(
  format: 'jpeg' | 'png' | 'webp' | 'gif',
  width = 64,
  height = 48,
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } },
  })
    .toFormat(format)
    .toBuffer();
}

/** 位置情報(GPS)と撮影機器の情報を含む JPEG */
export async function makeJpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: '#88aa22' } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'TestCamera', Model: 'GPS-1' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '35/1 41/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '139/1 41/1 0/1' },
    })
    .toBuffer();
}
