import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createDiary, diaryForm } from '../helpers/diaries.ts';
import { makeImage } from '../helpers/images.ts';
import { createUser, loginAs } from '../helpers/users.ts';

const ctx = buildTestContext();
beforeEach(resetDb);
afterAll(closeDb);

async function setup() {
  const alice = await createUser(ctx, { handle: 'alice' });
  const bob = await createUser(ctx, { handle: 'bobby' });
  const a = await loginAs(ctx, alice);
  const b = await loginAs(ctx, bob);
  await createDiary(a, '2026-11-01', 'もとの ぶんしょう');
  return { a, b };
}

describe('PUT /me/diaries/:date', () => {
  it('updates body and weather and keeps the image when none is sent', async () => {
    const { a } = await setup();
    const before = await (await a.get('/api/v1/users/alice/diaries/2026-11-01/image')).arrayBuffer();
    const res = await a.putForm('/api/v1/me/diaries/2026-11-01', await diaryForm({ body: 'かきなおし', weather: 'rainy', image: null }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ body: 'かきなおし', weather: 'rainy' });
    const after = await (await a.get('/api/v1/users/alice/diaries/2026-11-01/image')).arrayBuffer();
    expect(Buffer.from(after).equals(Buffer.from(before))).toBe(true);
  });

  it('replaces the image when one is sent', async () => {
    const { a } = await setup();
    await a.putForm('/api/v1/me/diaries/2026-11-01', await diaryForm({ body: 'x', weather: 'sunny', image: await makeImage('png', 300, 100) }));
    const img = Buffer.from(await (await a.get('/api/v1/users/alice/diaries/2026-11-01/image')).arrayBuffer());
    expect((await sharp(img).metadata()).width).toBe(300);
  });

  it('returns 404 for a date without a diary and for other users', async () => {
    const { a, b } = await setup();
    expect((await a.putForm('/api/v1/me/diaries/2026-10-01', await diaryForm({ body: 'x', weather: 'sunny', image: null }))).status).toBe(404);
    expect((await b.putForm('/api/v1/me/diaries/2026-11-01', await diaryForm({ body: 'x', weather: 'sunny', image: null }))).status).toBe(404);
    expect(await (await a.get('/api/v1/users/alice/diaries/2026-11-01')).json()).toMatchObject({ body: 'もとの ぶんしょう' });
  });
});

describe('DELETE /me/diaries/:date', () => {
  it('deletes the diary and its image', async () => {
    const { a } = await setup();
    expect((await a.delete('/api/v1/me/diaries/2026-11-01')).status).toBe(204);
    expect((await a.get('/api/v1/users/alice/diaries/2026-11-01')).status).toBe(404);
    expect((await a.get('/api/v1/users/alice/diaries/2026-11-01/image')).status).toBe(404);
  });

  it('returns 404 when another user tries to delete it', async () => {
    const { a, b } = await setup();
    expect((await b.delete('/api/v1/me/diaries/2026-11-01')).status).toBe(404);
    expect((await a.get('/api/v1/users/alice/diaries/2026-11-01')).status).toBe(200);
  });
});
