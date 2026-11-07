import sharp from 'sharp';
import { unzipSync, strFromU8 } from 'fflate';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createDiary } from '../helpers/diaries.ts';
import { createUser, follow, loginAs } from '../helpers/users.ts';

const ctx = buildTestContext();
beforeEach(resetDb);
afterAll(closeDb);

type Manifest = { schemaVersion: number; diaries: { date: string; body: string; weather: string; image: string }[] };

describe('GET /me/export', () => {
  it('returns a ZIP with manifest.json (schemaVersion 1) and every image', async () => {
    const client = await loginAs(ctx, await createUser(ctx, { handle: 'alice' }));
    await createDiary(client, '2026-11-02', 'ふつかめ');
    await createDiary(client, '2026-11-01', 'ついたち');
    const res = await client.get('/api/v1/me/export');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="diary-export-\d{8}\.zip"$/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(files['manifest.json'] ?? new Uint8Array())) as Manifest;
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.diaries.map((d) => [d.date, d.body, d.weather])).toEqual([
      ['2026-11-01', 'ついたち', 'sunny'],
      ['2026-11-02', 'ふつかめ', 'sunny'],
    ]);
    for (const d of manifest.diaries) {
      const image = files[d.image];
      expect(image).toBeDefined();
      expect((await sharp(Buffer.from(image ?? new Uint8Array())).metadata()).format).toBe('webp');
    }
  });

  it('contains only the requesting user’s diaries', async () => {
    const alice = await createUser(ctx, { handle: 'alice', visibility: 'public' });
    const bob = await createUser(ctx, { handle: 'bobby' });
    await follow(ctx, bob, alice);
    await createDiary(await loginAs(ctx, alice), '2026-11-01', 'ありすの');
    const b = await loginAs(ctx, bob);
    const files = unzipSync(new Uint8Array(await (await b.get('/api/v1/me/export')).arrayBuffer()));
    expect((JSON.parse(strFromU8(files['manifest.json'] ?? new Uint8Array())) as Manifest).diaries).toEqual([]);
  });

  it('requires sign-in', async () => {
    expect((await ctx.client().get('/api/v1/me/export')).status).toBe(401);
  });
});
