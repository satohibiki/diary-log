// エクスポートした ZIP をブラウザで展開し、通常の作成 API で1件ずつ取り込む(research.md §12)。
// 既存の日付は上書きせずスキップする。
import { unzip, strFromU8, type Unzipped } from 'fflate';
import { z } from 'zod';
import { bodySchema, diaryDateSchema, weatherSchema } from '@diary/shared';
import { api, ApiError } from '../../lib/api-client.ts';
import { UserFacingError } from '../../lib/errors.ts';

const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  diaries: z
    .array(
      z.object({
        date: diaryDateSchema,
        body: bodySchema,
        weather: weatherSchema,
        image: z.string().regex(/^images\/[\w.-]+\.webp$/),
      }),
    )
    .max(20_000),
});

export type ImportResult = { created: number; skipped: number; failed: { date: string; reason: string }[] };

function readZip(data: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(data, (error, files) => {
      if (error) reject(new UserFacingError('ZIP ファイルを読み込めませんでした'));
      else resolve(files);
    });
  });
}

export async function importDiaries(file: Blob, onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  if (file.size > MAX_ARCHIVE_BYTES) throw new UserFacingError('ファイルが大きすぎます(1GB まで)');
  const files = await readZip(new Uint8Array(await file.arrayBuffer()));
  const raw = files['manifest.json'];
  if (!raw) throw new UserFacingError('エクスポートした形式のファイルではありません(manifest.json がありません)');
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(raw));
  } catch {
    throw new UserFacingError('エクスポートした形式のファイルではありません(manifest.json を読み込めません)');
  }
  const manifest = manifestSchema.safeParse(parsed);
  if (!manifest.success) throw new UserFacingError('エクスポートした形式のファイルではないか、対応していない形式のバージョンです');

  const result: ImportResult = { created: 0, skipped: 0, failed: [] };
  const entries = manifest.data.diaries;
  for (const [index, entry] of entries.entries()) {
    const image = files[entry.image];
    if (!image) {
      result.failed.push({ date: entry.date, reason: '画像がありません' });
      continue;
    }
    const form = new FormData();
    form.set('date', entry.date);
    form.set('body', entry.body);
    form.set('weather', entry.weather);
    form.set('image', new Blob([new Uint8Array(image)], { type: 'image/webp' }), 'image.webp');
    try {
      await api('/me/diaries', { method: 'POST', form });
      result.created += 1;
    } catch (error) {
      if (error instanceof ApiError && error.problem.type === 'diary-exists') result.skipped += 1;
      else if (error instanceof ApiError && error.status !== 0 && error.status !== 401) {
        result.failed.push({ date: entry.date, reason: error.problem.title });
      } else {
        // 接続の切断やログインの失効は、続けても失敗するため中断して伝える
        throw error;
      }
    }
    onProgress?.(index + 1, entries.length);
  }
  return result;
}
