import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { diaryForm } from '../helpers/diaries.ts';
import { makeJpegWithGps } from '../helpers/images.ts';
import { createUser, follow, loginAs } from '../helpers/users.ts';

const ctx = buildTestContext();
beforeEach(resetDb);
afterAll(closeDb);

describe('diary images', () => {
  it('are served as WebP with no-store and nosniff, without GPS data', async () => {
    const alice = await createUser(ctx, { handle: 'alice' });
    const a = await loginAs(ctx, alice);
    await a.postForm('/api/v1/me/diaries', await diaryForm({ date: '2026-11-01', body: 'x', weather: 'sunny', image: await makeJpegWithGps() }));
    const res = await a.get('/api/v1/users/alice/diaries/2026-11-01/image');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const image = Buffer.from(await res.arrayBuffer());
    expect((await sharp(image).metadata()).exif).toBeUndefined();
    expect(image.includes(Buffer.from('TestCamera'))).toBe(false);
  });

  it('return the same 404 to viewers without permission as for missing images', async () => {
    const alice = await createUser(ctx, { handle: 'alice', visibility: 'private' });
    const bob = await createUser(ctx, { handle: 'bobby' });
    await follow(ctx, bob, alice);
    const a = await loginAs(ctx, alice);
    const b = await loginAs(ctx, bob);
    await a.postForm('/api/v1/me/diaries', await diaryForm({ date: '2026-11-01', body: 'x', weather: 'sunny' }));
    const forbidden = await b.get('/api/v1/users/alice/diaries/2026-11-01/image');
    const missing = await b.get('/api/v1/users/alice/diaries/2026-10-01/image');
    expect(forbidden.status).toBe(404);
    expect(await forbidden.text()).toBe(await missing.text());
    expect((await ctx.client().get('/api/v1/users/alice/diaries/2026-11-01/image')).status).toBe(401);
  });

  it('are visible to approved followers of a public user', async () => {
    const alice = await createUser(ctx, { handle: 'alice', visibility: 'public' });
    const bob = await createUser(ctx, { handle: 'bobby' });
    await follow(ctx, bob, alice);
    const a = await loginAs(ctx, alice);
    await a.postForm('/api/v1/me/diaries', await diaryForm({ date: '2026-11-01', body: 'x', weather: 'sunny' }));
    const b = await loginAs(ctx, bob);
    expect((await b.get('/api/v1/users/alice/diaries/2026-11-01/image')).status).toBe(200);
    expect((await b.get('/api/v1/users/alice/diaries/2026-11-01')).status).toBe(200);
  });
});
