// 全絵日記を ZIP でエクスポートする(FR-020)。形式は docs/export-format.md を参照
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';
import { asc, eq } from 'drizzle-orm';
import type { ApiApp, AppDeps } from '../app.ts';
import { requireAuth } from '../auth/middleware.ts';
import { diaries } from '../platform/db/schema.ts';
import { readContent, readImage } from './repository.ts';

export const EXPORT_SCHEMA_VERSION = 1;

export function exportRoutes(api: ApiApp, deps: AppDeps): void {
  api.get('/me/export', requireAuth('full'), async (c) => {
    const { userId } = c.get('session');
    const dates = await deps.db
      .select({ id: diaries.id })
      .from(diaries)
      .where(eq(diaries.userId, userId))
      .orderBy(asc(diaries.diaryDate));

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const zip = new Zip((error, chunk, final) => {
          if (error) {
            controller.error(error);
            return;
          }
          controller.enqueue(chunk);
          if (final) controller.close();
        });
        try {
          const entries: { date: string; body: string; weather: string; image: string }[] = [];
          // 1件ずつ読み込み、メモリの使用量を抑える
          for (const { id } of dates) {
            const [row] = await deps.db.select().from(diaries).where(eq(diaries.id, id));
            if (!row) continue;
            const content = readContent(deps, row);
            const path = `images/${row.diaryDate}.webp`;
            const file = new ZipPassThrough(path);
            zip.add(file);
            file.push(new Uint8Array(readImage(deps, row)), true);
            entries.push({ date: row.diaryDate, body: content.body, weather: content.weather, image: path });
          }
          const manifest = new ZipDeflate('manifest.json');
          zip.add(manifest);
          manifest.push(
            strToU8(JSON.stringify({ schemaVersion: EXPORT_SCHEMA_VERSION, exportedAt: deps.now().toISOString(), diaries: entries }, null, 2)),
            true,
          );
          zip.end();
        } catch (error) {
          deps.logger.errorFrom('export-failed', error, { userId });
          controller.error(error);
        }
      },
    });
    const stamp = deps.now().toISOString().slice(0, 10).replaceAll('-', '');
    return c.body(stream, 200, {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="diary-export-${stamp}.zip"`,
    });
  });
}
