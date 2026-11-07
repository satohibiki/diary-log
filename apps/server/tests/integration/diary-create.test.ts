import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { diaries } from '../../src/platform/db/schema.ts';
import { buildTestContext } from '../helpers/app.ts';
import { closeDb, resetDb } from '../helpers/db.ts';
import { createDiary, diaryForm } from '../helpers/diaries.ts';
import { createUser, loginAs } from '../helpers/users.ts';

let clock = new Date('2026-11-07T03:00:00Z');
const ctx = buildTestContext({ now: () => clock });
beforeEach(async () => {
  await resetDb();
  clock = new Date('2026-11-07T03:00:00Z');
});
afterAll(closeDb);

async function signedIn(handle = 'alice') {
  const user = await createUser(ctx, { handle, nickname: 'ありす' });
  return { user, client: await loginAs(ctx, user) };
}

describe('POST /me/diaries', () => {
  it('creates a diary and returns it', async () => {
    const { client } = await signedIn();
    const res = await client.postForm(
      '/api/v1/me/diaries',
      await diaryForm({ date: '2026-11-07', body: 'あさがおが さきました。', weather: 'sunny' }),
    );
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      date: '2026-11-07',
      body: 'あさがおが さきました。',
      weather: 'sunny',
      author: { handle: 'alice', nickname: 'ありす', hasAvatar: false },
    });
    expect(body.imageUrl).toMatch(/^\/api\/v1\/users\/alice\/diaries\/2026-11-07\/image/);
  });

  it('can be read back by its owner with no-store', async () => {
    const { client } = await signedIn();
    await createDiary(client, '2026-11-01', 'きのうの にっき');
    const res = await client.get('/api/v1/users/alice/diaries/2026-11-01');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ body: 'きのうの にっき' });
  });

  it.each([
    ['date', { body: 'a', weather: 'sunny' }],
    ['body', { date: '2026-11-07', weather: 'sunny' }],
    ['weather', { date: '2026-11-07', body: 'a' }],
  ])('requires %s', async (field, fields) => {
    const { client } = await signedIn();
    const res = await client.postForm('/api/v1/me/diaries', await diaryForm(fields));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { errors: { field: string }[] };
    expect(body.errors.map((e) => e.field)).toContain(field);
  });

  it('requires an image', async () => {
    const { client } = await signedIn();
    const res = await client.postForm('/api/v1/me/diaries', await diaryForm({ date: '2026-11-07', body: 'a', weather: 'sunny', image: null }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ errors: [{ field: 'image' }] });
  });

  it('rejects more than 400 characters', async () => {
    const { client } = await signedIn();
    const res = await client.postForm('/api/v1/me/diaries', await diaryForm({ date: '2026-11-07', body: 'あ'.repeat(401), weather: 'sunny' }));
    expect(res.status).toBe(422);
  });

  it('returns 409 for a second diary on the same date', async () => {
    const { client } = await signedIn();
    await createDiary(client, '2026-11-07');
    const res = await client.postForm('/api/v1/me/diaries', await diaryForm({ date: '2026-11-07', body: 'b', weather: 'rainy' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ type: 'diary-exists' });
  });

  it('accepts today in the earliest time zone (UTC+14) but rejects later dates', async () => {
    const { client } = await signedIn();
    clock = new Date('2026-11-07T10:30:00Z'); // UTC+14 では 2026-11-08 00:30
    expect((await client.postForm('/api/v1/me/diaries', await diaryForm({ date: '2026-11-08', body: 'a', weather: 'sunny' }))).status).toBe(201);
    const res = await client.postForm('/api/v1/me/diaries', await diaryForm({ date: '2026-11-09', body: 'a', weather: 'sunny' }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ errors: [{ field: 'date', code: 'future' }] });
  });

  it('stores body, weather, and image only in encrypted form', async () => {
    const { client } = await signedIn();
    await createDiary(client, '2026-11-07', 'ひみつの ないよう です');
    const [row] = await ctx.deps.db.select().from(diaries);
    expect(row?.contentEnc.toString('latin1')).not.toContain('sunny');
    expect(Buffer.concat([row?.contentEnc ?? Buffer.alloc(0)]).includes(Buffer.from('ひみつ'))).toBe(false);
    expect(row?.imageEnc.subarray(0, 4).toString('latin1')).not.toBe('RIFF');
  });

  it('requires a full session', async () => {
    const res = await ctx.client().postForm('/api/v1/me/diaries', await diaryForm({ date: '2026-11-07', body: 'a', weather: 'sunny' }));
    expect(res.status).toBe(401);
  });

  it('rejects files over 10MB with 413', async () => {
    const { client } = await signedIn();
    const res = await client.postForm(
      '/api/v1/me/diaries',
      await diaryForm({ date: '2026-11-07', body: 'a', weather: 'sunny', image: Buffer.alloc(10 * 1024 * 1024 + 10) }),
    );
    expect(res.status).toBe(413);
  });
});
